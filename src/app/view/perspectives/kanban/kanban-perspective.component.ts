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

import {Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, ViewChild} from '@angular/core';

import {Store} from '@ngrx/store';
import {filter, withLatestFrom} from 'rxjs/operators';
import {Subscription} from 'rxjs/Subscription';
import {AppState} from '../../../core/store/app.state';
import {DocumentDataModel, DocumentModel} from '../../../core/store/documents/document.model';
import {DocumentsAction} from '../../../core/store/documents/documents.action';
import {selectDocumentsByCustomQuery} from '../../../core/store/documents/documents.state';
import {QueryModel} from '../../../core/store/navigation/query.model';
import {KanbanLayout} from '../../../shared/utils/layout/kanban-layout';
import {KanbanColumnLayout} from '../../../shared/utils/layout/kanban-column-layout';
import {KanbanLayoutConfig} from '../../../shared/utils/layout/Kanban-layout-config';
import {KanbanSortingLayout} from '../../../shared/utils/layout/Kanban-sorting-layout';
import {KanbanDocumentModel} from './document-data/kanban-document-model';
import {InfiniteScroll} from './util/infinite-scroll';
import {NavigationHelper} from './util/navigation-helper';
import {ATTRIBUTE_COLUMN, SelectionHelper, VALUE_COLUMN} from './util/selection-helper';
import {isNullOrUndefined} from 'util';
import {KeyCode} from '../../../shared/key-code';
import {HashCodeGenerator} from '../../../shared/utils/hash-code-generator';
import {selectCollectionsByQuery} from '../../../core/store/collections/collections.state';
import {selectCurrentUserForWorkspace} from '../../../core/store/users/users.state';
import {userRolesInResource} from '../../../shared/utils/resource.utils';
import {Role} from '../../../core/model/role';
import Create = DocumentsAction.Create;
import UpdateData = DocumentsAction.UpdateData;
import {DeletionHelper} from './util/deletion-helper';
import {AttributeModel, CollectionModel} from '../../../core/store/collections/collection.model';
import {CollectionsAction} from '../../../core/store/collections/collections.action';
import DeleteConfirm = DocumentsAction.DeleteConfirm;
import {Document} from '../../../core/dto';
import {KanbanColumnModel} from './document-data/kanban-column-model';

@Component({
  selector: 'kanban-perspective',
  templateUrl: './kanban-perspective.component.html',
  styleUrls: ['./kanban-perspective.component.scss']
})
export class KanbanPerspectiveComponent implements OnInit, OnDestroy {

  private _useOwnScrollbar = false;
  public static columns: any[] = [];
  // private static documents: any[] = [];

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

  // public set useOwnScrollbar(value: boolean) {
  //   this._useOwnScrollbar = value;
  //
  //   if (this.infiniteScroll) {
  //     this.infiniteScroll.setUseParentScrollbar(value);
  //   }
  // }

  @ViewChild('layout')
  public layoutElement: ElementRef;

  public infiniteScroll: InfiniteScroll;

  public perspectiveId = String(Math.floor(Math.random() * 1000000000000000) + 1);

  public kanbans: KanbanDocumentModel[] = [];

  public kanbanColumns: KanbanColumnModel[] = [];

  public navigationHelper: NavigationHelper;

  public selectionHelper: SelectionHelper;

  public collectionRoles: { [collectionId: string]: string[] };

  private deletionHelper: DeletionHelper;

  // public static layoutManagers: KanbanLayout[] = [];

  public static columnLayoutManagers: KanbanColumnLayout[] = [];

  private subscriptions: Subscription[] = [];

  private pageSubscriptions: Subscription[] = [];

  private createdDocumentCorrelationId: string;

  private allLoaded: boolean;

  private collectionsSubscription: Subscription;

  private collections: { [collectionId: string]: CollectionModel };

  private attributes: Set<AttributeModel> = new Set();

  private selectedAttribute: AttributeModel;

  public attributeSelected = new EventEmitter<string>();

  constructor(private store: Store<AppState>,
              private zone: NgZone,
              private element: ElementRef) {
  }

  public ngOnInit(): void {

    // this.createLayoutManager();
    this.createInfiniteScroll();
    this.createDefectionHelper();
    this.createSelectionHelper();
    this.createNavigationHelper();
    this.createCollectionsSubscription();
  }

  private createInfiniteScroll() {
    this.infiniteScroll = new InfiniteScroll(
      () => this.loadMoreOnInfiniteScroll(),
      this.element.nativeElement,
      this.useOwnScrollbar
    );
    this.infiniteScroll.initialize();
  }

  private createSelectionHelper() {
    this.selectionHelper = new SelectionHelper(
      this.kanbans,
      () => this.documentsPerRow(),
      this.perspectiveId
    );
  }

  private createDefectionHelper() {
    this.deletionHelper = new DeletionHelper(this.store, this.kanbans);
    this.deletionHelper.initialize();
  }

  private createNavigationHelper() {
    this.navigationHelper = new NavigationHelper(this.store, () => this.documentsPerRow());
    this.navigationHelper.onChange(() => this.resetToInitialState());
    this.navigationHelper.onValidNavigation(() => this.getKanbans());
    this.navigationHelper.initialize();
  }

  private createCollectionsSubscription() {
    this.collectionsSubscription = this.store.select(selectCollectionsByQuery).pipe(
      withLatestFrom(this.store.select(selectCurrentUserForWorkspace))
    ).subscribe(([collections, user]) => {
      this.collections = collections.reduce((acc, coll) => {
        acc[coll.id] = coll;
        return acc;
      }, {});
      this.collectionRoles = collections.reduce((roles, collection) => {
        roles[collection.id] = userRolesInResource(user, collection);
        return roles;
      }, {});
    });
  }

  private addKanbanColumn(columns: Array<KanbanColumnModel>, kanban: KanbanDocumentModel, attribute) {

    const value: string = kanban.document.data[attribute.id];
    if (!columns.find(c => c.name === value)) {
      columns.push(new KanbanColumnModel(columns.length, value, attribute.id));
    }
  }

  public selectAttribute(attribute: AttributeModel) {
    this.selectedAttribute = attribute;

    const columns: Array<KanbanColumnModel> = [];
    this.kanbans.forEach((k) => {
      this.addKanbanColumn(columns, k, attribute);
    });
    KanbanPerspectiveComponent.columnLayoutManagers = [];
    this.kanbanColumns = columns;
    const tempKanbans = this.kanbans;
    this.kanbans = [];
    setTimeout(() => {
      this.kanbans = tempKanbans;
    });
    // this.attributeSelected.emit(this.selectedAttribute.id);
  }

  public getAttributes(): Array<AttributeModel> {
    return Array.from(this.attributes);
  }

  public onFavoriteChange(document: Document, data: { favorite: boolean, onlyStore: boolean }) {
    const {favorite, onlyStore} = data;
    if (onlyStore) {
      if (favorite) {
        this.store.dispatch(new DocumentsAction.AddFavoriteSuccess({documentId: document.id}));
      } else {
        this.store.dispatch(new DocumentsAction.RemoveFavoriteSuccess({documentId: document.id}));
      }
    } else {
      if (favorite) {
        this.store.dispatch(new DocumentsAction.AddFavorite({collectionId: document.collectionId, documentId: document.id}));
      } else {
        this.store.dispatch(new DocumentsAction.RemoveFavorite({collectionId: document.collectionId, documentId: document.id}));
      }
    }
  }

  private resetToInitialState(): void {
    this.allLoaded = false;
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
    this.subscriptions.splice(0);
    this.kanbans.splice(0);
  }

  public fetchQueryDocuments(queryModel: QueryModel): void {
    this.store.dispatch(new DocumentsAction.Get({query: queryModel}));
  }

  public hasSingleCollection(): boolean {
    return this.getCollectionIds().length === 1;
  }

  public hasCreateRights(): boolean {
    const keys = this.getCollectionIds();
    return keys.length === 1 && this.collectionRoles[keys[0]].includes(Role.Write);
  }

  private getCollectionIds(): string[] {
    return this.collectionRoles && Object.keys(this.collectionRoles) || [];
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

    const page = this.subscriptions.length;
    const queryModel = this.navigationHelper.queryWithPagination(page);
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
    if (Object.keys(focusedKanban.document.data).length === 0) {
      return ATTRIBUTE_COLUMN;
    }

    return VALUE_COLUMN;
  }

  public kanbanChanged(changedKanban: KanbanDocumentModel, document: DocumentModel): void {
    if (this.kanbanInInitialState(changedKanban, document)) {
      return;
    }

    if (!changedKanban.initialized) {
      this.initializeKanban(changedKanban, document);
      return;
    }

    this.updateDocument(document);
  }

  public removeKanban(kanban: KanbanDocumentModel) {
    if (kanban.initialized) {
      this.store.dispatch(new DeleteConfirm({
        collectionId: kanban.document.collectionId,
        documentId: kanban.document.id
      }));

    } else {
      this.deletionHelper.deleteKanban(kanban);
    }
  }

  private kanbanInInitialState(kanban: KanbanDocumentModel, document: DocumentModel): boolean {
    const isUninitialized = !kanban.initialized;
    const hasInitialAttributes = Object.keys(document.data).length === this.getCollection(kanban).attributes.length;
    const hasInitialValues = Object.values(document.data).every(d => d.value === '');
    const hasNotNewValues = isNullOrUndefined(document.newData) || Object.keys(document.newData).length === 0;

    return isUninitialized && hasInitialAttributes && hasInitialValues && hasNotNewValues;
  }

  public getCollection(kanban: KanbanDocumentModel): CollectionModel {
    const collectionId = kanban && kanban.document && kanban.document.collectionId;
    return collectionId && this.collections[collectionId];
  }

  private subscribeOnDocuments(queryModel: QueryModel) {
    const subscription = this.store.select(selectDocumentsByCustomQuery(queryModel)).pipe(
      filter(() => this.canFetchDocuments())
    ).subscribe(documents => {
      this.updateLayoutWithDocuments(documents);
    });

    this.pageSubscriptions.push(subscription);
  }

  private canFetchDocuments() {
    return this.navigationHelper.validNavigation();
  }

  private updateLayoutWithDocuments(documents: DocumentModel[]) {
    setTimeout(() => {
      this.checkAllLoaded(documents);
      this.addDocumentsNotInLayout(documents);
      this.refreshExistingDocuments(documents);
      // this.focusNewDocumentIfPresent(documents);

      this.infiniteScroll.finishLoading();
      KanbanPerspectiveComponent.columnLayoutManagers.forEach(clM => clM.refresh());
    });
  }

  private refreshExistingDocuments(documents: DocumentModel[]) {
    for (let document of documents) {
      const index = this.kanbans.findIndex(k => k.document.id === document.id);
      if (index !== -1) {
        const kanban = {...this.kanbans[index], document};
        this.kanbans.splice(index, 1, kanban);
      }
    }
  }

  private addDocumentsNotInLayout(documents: DocumentModel[]): void {
    const usedDocumentIDs = new Set(this.kanbans.map(kanban => kanban.document.id));
    documents
      .filter(documentModel => !usedDocumentIDs.has(documentModel.id))
      .forEach(documentModel => {
        const kanban: KanbanDocumentModel = this.documentModelToKanbanModel(documentModel);
        this.kanbans.push(kanban);
        const collection: CollectionModel = this.getCollection(kanban);
        collection.attributes.forEach(attr => this.attributes.add(attr));
      });

    const attribute: AttributeModel = Array.from(this.attributes)[0];
    if (this.selectedAttribute === undefined && this.attributes.size > 0) {
      this.selectAttribute(attribute);
    }
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
    return this.kanbans
      .filter(kanban => kanban !== null)
      .find(kanban => kanban.document.id === document.id);
  }

  private updateDocument(document: DocumentModel) {
    if (document.newData) {
      const action = new UpdateData({document});
      const newAttributes = Object.keys(document.newData).map(name => ({name, constraints: [], correlationId: document.newData[name].correlationId}));

      this.store.dispatch(new CollectionsAction.CreateAttributes(
        {collectionId: document.collectionId, attributes: newAttributes, nextAction: action})
      );
    } else {
      this.store.dispatch(new UpdateData({document: document}));
    }
  }

  private initializeKanban(kanbanToInitialize: KanbanDocumentModel, document: DocumentModel): void {
    if (kanbanToInitialize.updating) {
      return;
    }

    this.createdDocumentCorrelationId = kanbanToInitialize.document.correlationId;
    kanbanToInitialize.updating = true;

    this.createDocument(document);
    this.kanbans.splice(this.kanbans.indexOf(kanbanToInitialize), 1);

  }

  private createDocument(document: DocumentModel) {
    if (document.newData) {
      const action = new Create({document});
      const newAttributes = Object.keys(document.newData).map(name => ({name, constraints: [], correlationId: document.newData[name].correlationId}));

      this.store.dispatch(new CollectionsAction.CreateAttributes(
        {collectionId: document.collectionId, attributes: newAttributes, nextAction: action})
      );
    } else {
      this.store.dispatch(new Create({document: document}));
    }
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

  // this is stub For test for check column
  public getKanbanColumn(kanban: KanbanDocumentModel) {
    if (this.selectedAttribute) {
      const { id } = this.selectedAttribute;
      const column = this.kanbanColumns.find(c => c.rowId === id && c.name === kanban.document.data[id]);
      if (column) {
        return KanbanPerspectiveComponent.columnLayoutManagers[column.managerId];
      }
    }
    // return KanbanPerspectiveComponent.columnLayoutManagers[idx];
  }

  private documentsPerRow(): number {
    const kanbanWidth = 225;
    const layoutWidth = this.layoutElement.nativeElement.clientWidth;

    return Math.max(1, Math.floor(layoutWidth / kanbanWidth));
  }

  public getCollectionRoles(kanban: KanbanDocumentModel): string[] {
    return this.collectionRoles && this.collectionRoles[kanban.document.collectionId] || [];
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
