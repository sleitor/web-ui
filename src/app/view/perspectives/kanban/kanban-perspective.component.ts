/*
 * Lumeer: Modern Data Definition and Processing Platform
 *
 * Copyright (C) since 2017 Answer Institute, s.r.o. and/or its affiliates.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import {Component, ElementRef, HostListener, Input, NgZone, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {Store} from '@ngrx/store';
import {filter} from 'rxjs/operators';
import {Subscription} from 'rxjs/Subscription';
import {AppState} from '../../../core/store/app.state';
import {DocumentModel} from '../../../core/store/documents/document.model';
import {DocumentsAction} from '../../../core/store/documents/documents.action';
import {selectDocumentsByCustomQuery} from '../../../core/store/documents/documents.state';
import {QueryModel} from '../../../core/store/navigation/query.model';
import {KanbanLayout} from '../../../shared/utils/layout/kanban-layout';
import {KanbanLayoutConfig} from '../../../shared/utils/layout/kanban-layout-config';
import {KanbanSortingLayout} from '../../../shared/utils/layout/kanban-sorting-layout';
import {KanbanDocumentModel} from './document-data/kanban-document-model';
import {DeletionHelper} from './util/deletion-helper';
import {InfiniteScroll} from './util/infinite-scroll';
import {NavigationHelper} from './util/navigation-helper';
import {ATTRIBUTE_COLUMN, SelectionHelper, VALUE_COLUMN} from './util/selection-helper';
import {isNullOrUndefined} from 'util';
import {KeyCode} from '../../../shared/key-code';
import {HashCodeGenerator} from '../../../shared/utils/hash-code-generator';
import {CollectionModel} from '../../../core/store/collections/collection.model';
import {Permission} from '../../../core/dto';
import {Role} from '../../../core/model/role';
import Create = DocumentsAction.Create;
import UpdateData = DocumentsAction.UpdateData;

@Component({
  selector: 'kanban-perspective',
  templateUrl: './kanban-perspective.component.html',
  styleUrls: ['./kanban-perspective.component.scss']
})
export class KanbanPerspectiveComponent implements OnInit, OnDestroy {

  private _useOwnScrollbar = false;

  @HostListener('document:keydown', ['$event'])
  public onKeyboardClick(event: KeyboardEvent) {
    if (this.isNavigationKey(event.keyCode)) {
      this.handleNavigationKeydown();
    }
  }

  private handleNavigationKeydown() {
    if (this.selectionHelper) {
      this.selectionHelper.initializeIfNeeded();
    }
  }

  private isNavigationKey(keyCode: number): boolean {
    return [KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.Enter, KeyCode.Tab].includes(keyCode);
  }

  @Input()
  public get useOwnScrollbar(): boolean {
    return this._useOwnScrollbar;
  }

  public set useOwnScrollbar(value: boolean) {
    this._useOwnScrollbar = value;

    if (this.infiniteScroll) {
      this.infiniteScroll.setUseParentScrollbar(value);
    }
  }

  @ViewChild('layout')
  public layoutElement: ElementRef;

  public infiniteScroll: InfiniteScroll;

  public perspectiveId = String(Math.floor(Math.random() * 1000000000000000) + 1);

  public kanbans: KanbanDocumentModel[] = [];

  public navigationHelper: NavigationHelper;

  public selectionHelper: SelectionHelper;

  private deletionHelper: DeletionHelper;

  private layoutManager: KanbanLayout;

  private pageSubscriptions: Subscription[] = [];

  private createdDocumentCorrelationId: string;

  private allLoaded: boolean;

  private page = 0;

  constructor(private store: Store<AppState>,
              private zone: NgZone,
              private element: ElementRef) {
  }

  public ngOnInit(): void {
    this.layoutManager = new KanbanSortingLayout(
      '.kanban-document-layout',
      new KanbanLayoutConfig(),
      this.sortByOrder,
      '.kanban-document-header',
      this.zone
    );

    this.infiniteScroll = new InfiniteScroll(
      () => this.loadMoreOnInfiniteScroll(),
      this.element.nativeElement,
      this.useOwnScrollbar
    );
    this.infiniteScroll.initialize();

    this.selectionHelper = new SelectionHelper(
      this.kanbans,
      () => this.documentsPerRow(),
      this.perspectiveId
    );

    this.navigationHelper = new NavigationHelper(this.store, () => this.documentsPerRow());
    this.navigationHelper.setCallback(() => this.reinitializeKanbans());
    this.navigationHelper.initialize();

    this.deletionHelper = new DeletionHelper(this.store, this.kanbans);
    this.deletionHelper.initialize();
  }

  private reinitializeKanbans(): void {
    this.resetToInitialState();
    this.getKanbans();
  }

  private resetToInitialState(): void {
    this.allLoaded = false;
    this.page = 0;
    this.kanbans.splice(0);
    this.pageSubscriptions.forEach(subscription => subscription.unsubscribe());
  }

  public fetchQueryDocuments(queryModel: QueryModel): void {
    this.store.dispatch(new DocumentsAction.Get({query: queryModel}));
  }

  public hasSingleCollection(): boolean {
    return this.navigationHelper.hasOneCollection();
  }

  public hasCreateRights(): boolean {
    return this.kanbans[0] && this.collectionHasWriteRole(this.kanbans[0].document.collection);
  }

  public collectionHasWriteRole(collection: CollectionModel): boolean {
    const permissions = collection && collection.permissions || {users: [], groups: []};
    return permissions.users.some((permission: Permission) => permission.roles.includes(Role.Write));
  }

  private checkAllLoaded(documents: DocumentModel[]): void {
    this.allLoaded = documents.length === 0;
  }

  private loadMoreOnInfiniteScroll(): void {
    if (!this.allLoaded && this.navigationHelper && this.navigationHelper.validNavigation()) {
      this.getKanbans();
    }
  }

  private getKanbans(): void {
    this.infiniteScroll.startLoading();

    const queryModel = this.navigationHelper.queryWithPagination(this.page++);
    this.fetchQueryDocuments(queryModel);
    this.subscribeOnDocuments(queryModel);
  }

  public createKanban(document: DocumentModel): void {
    const newKanban = this.documentModelToKanbanModel(document);
    this.kanbans.unshift(newKanban);

    setTimeout(() => {
      this.selectAndFocusCreatedKanban(newKanban);
    });
  }

  private selectAndFocusCreatedKanban(newKanban: KanbanDocumentModel) {
    this.selectionHelper.select(this.createdKanbanPreferredColumn(newKanban), 0, newKanban);
    this.selectionHelper.setEditMode(true);
    this.selectionHelper.focus();
  }

  private createdKanbanPreferredColumn(focusedKanban: KanbanDocumentModel): number {
    const attributes = Object.keys(focusedKanban.document.data);
    if (attributes.length === 0) {
      return ATTRIBUTE_COLUMN;
    }

    return VALUE_COLUMN;
  }

  public kanbanChanged(changedKanban: KanbanDocumentModel): void {
    if (this.kanbanInInitialState(changedKanban)) {
      return;
    }

    if (!changedKanban.initialized) {
      this.initializeKanban(changedKanban);
      return;
    }

    this.updateDocument(changedKanban);
  }

  private kanbanInInitialState(kanban: KanbanDocumentModel): boolean {
    const isUninitialized = !kanban.initialized;
    const hasInitialAttributes = Object.keys(kanban.document.data).length === kanban.document.collection.attributes.length;
    const hasInitialValues = Object.values(kanban.document.data).every(value => value === '');

    return isUninitialized && hasInitialAttributes && hasInitialValues;
  }

  private subscribeOnDocuments(queryModel: QueryModel) {
    const subscription = this.store.select(selectDocumentsByCustomQuery(queryModel)).pipe(
      filter(() => this.canFetchDocuments())
    ).subscribe(documents => this.updateLayoutWithDocuments(documents));

    this.pageSubscriptions.push(subscription);
  }

  private canFetchDocuments() {
    return this.navigationHelper.validNavigation();
  }

  private updateLayoutWithDocuments(documents) {
    setTimeout(() => {
      this.checkAllLoaded(documents);
      this.addDocumentsNotInLayout(documents);
      this.focusNewDocumentIfPresent(documents);

      this.infiniteScroll.finishLoading();
      this.layoutManager.refresh();
    });
  }

  private addDocumentsNotInLayout(documents: DocumentModel[]): void {
    const usedDocumentIDs = new Set(this.kanbans.map(kanban => kanban.document.id));
    documents
      .filter(documentModel => !usedDocumentIDs.has(documentModel.id))
      .forEach(documentModel => this.kanbans.push(this.documentModelToKanbanModel(documentModel)));
  }

  private focusNewDocumentIfPresent(documents: DocumentModel[]): void {
    const newDocument = documents.find(document => document.correlationId === this.createdDocumentCorrelationId);

    if (newDocument) {
      this.focusDocument(newDocument);
      this.createdDocumentCorrelationId = null;
    }
  }

  private focusDocument(document: DocumentModel): void {
    const focusedKanban = this.findKanbanOfDocument(document);

    setTimeout(() => {
      this.selectKanban(focusedKanban);
    });
  }

  private selectKanban(focusedKanban: KanbanDocumentModel) {
    this.selectionHelper.select(0, 0, focusedKanban);
  }

  private findKanbanOfDocument(document: DocumentModel): KanbanDocumentModel {
    return this.kanbans.find(kanban => kanban.document.id === document.id);
  }

  private updateDocument(kanban: KanbanDocumentModel) {
    this.store.dispatch(new UpdateData(
      {
        collectionId: kanban.document.collectionId,
        documentId: kanban.document.id,
        data: kanban.document.data
      }
    ));
  }

  private initializeKanban(kanbanToInitialize: KanbanDocumentModel): void {
    if (!kanbanToInitialize.updating) {
      this.createdDocumentCorrelationId = kanbanToInitialize.document.correlationId;
      kanbanToInitialize.updating = true;

      this.store.dispatch(new Create({document: kanbanToInitialize.document}));
      this.kanbans.splice(this.kanbans.indexOf(kanbanToInitialize), 1);
    }
  }

  public deleteKanban(kanban: KanbanDocumentModel): void {
    this.deletionHelper.deleteKanban(kanban);
  }

  private documentModelToKanbanModel(documentModel: DocumentModel): KanbanDocumentModel {
    const kanban = new KanbanDocumentModel();
    kanban.document = documentModel;
    kanban.initialized = Boolean(documentModel.id);

    const direction = this.wasCreatedPreviously(kanban) ? 1 : -1;
    kanban.order = this.kanbans.length * direction;

    return kanban;
  }

  private wasCreatedPreviously(kanban: KanbanDocumentModel): boolean {
    return kanban.initialized && isNullOrUndefined(kanban.document.correlationId);
  }

  public kanbanWithIndex(kanban: KanbanDocumentModel, index: number): KanbanDocumentModel {
    kanban.index = index;
    return kanban;
  }

  private documentsPerRow(): number {
    const kanbanWidth = 225;
    const layoutWidth = this.layoutElement.nativeElement.clientWidth;

    return Math.max(1, Math.floor(layoutWidth / kanbanWidth));
  }

  private sortByOrder(item: any, element: HTMLElement): number {
    return Number(element.getAttribute('order'));
  }

  public trackByDocument(index: number, kanban: KanbanDocumentModel): number {
    return HashCodeGenerator.hashString(kanban.document.id || kanban.document.correlationId);
  }

  public ngOnDestroy(): void {
    if (this.deletionHelper) {
      this.deletionHelper.destroy();
    }

    if (this.navigationHelper) {
      this.navigationHelper.destroy();
    }

    if (this.infiniteScroll) {
      this.infiniteScroll.destroy();
    }

    this.pageSubscriptions.forEach(subscription => subscription.unsubscribe());
  }

}
