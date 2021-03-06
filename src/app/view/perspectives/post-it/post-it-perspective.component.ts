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
import {filter, withLatestFrom} from 'rxjs/operators';
import {Subscription} from 'rxjs';
import {AppState} from '../../../core/store/app.state';
import {DocumentModel} from '../../../core/store/documents/document.model';
import {DocumentsAction} from '../../../core/store/documents/documents.action';
import {selectDocumentsByCustomQuery} from '../../../core/store/documents/documents.state';
import {QueryModel} from '../../../core/store/navigation/query.model';
import {PostItLayout} from '../../../shared/utils/layout/post-it-layout';
import {PostItLayoutConfig} from '../../../shared/utils/layout/post-it-layout-config';
import {PostItSortingLayout} from '../../../shared/utils/layout/post-it-sorting-layout';
import {PostItDocumentModel} from './document-data/post-it-document-model';
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
import {CollectionModel} from '../../../core/store/collections/collection.model';
import {CollectionsAction} from '../../../core/store/collections/collections.action';
import DeleteConfirm = DocumentsAction.DeleteConfirm;
import {Document} from '../../../core/dto';

@Component({
  selector: 'post-it-perspective',
  templateUrl: './post-it-perspective.component.html',
  styleUrls: ['./post-it-perspective.component.scss']
})
export class PostItPerspectiveComponent implements OnInit, OnDestroy {

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

  public postIts: PostItDocumentModel[] = [];

  public navigationHelper: NavigationHelper;

  public selectionHelper: SelectionHelper;

  public collectionRoles: { [collectionId: string]: string[] };

  private deletionHelper: DeletionHelper;

  private layoutManager: PostItLayout;

  private subscriptions: Subscription[] = [];

  private createdDocumentCorrelationId: string;

  private allLoaded: boolean;

  private collectionsSubscription: Subscription;

  private collections: { [collectionId: string]: CollectionModel };

  constructor(private store: Store<AppState>,
              private zone: NgZone,
              private element: ElementRef) {
  }

  public ngOnInit(): void {
    this.createLayoutManager();
    this.createInfiniteScroll();
    this.createDefectionHelper();
    this.createSelectionHelper();
    this.createNavigationHelper();
    this.createCollectionsSubscription();
  }

  private createLayoutManager() {
    this.layoutManager = new PostItSortingLayout(
      '.post-it-document-layout',
      new PostItLayoutConfig(),
      this.sortByOrder,
      'post-it-document',
      this.zone
    );
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
      this.postIts,
      () => this.documentsPerRow(),
      this.perspectiveId
    );
  }

  private createDefectionHelper() {
    this.deletionHelper = new DeletionHelper(this.store, this.postIts);
    this.deletionHelper.initialize();
  }

  private createNavigationHelper() {
    this.navigationHelper = new NavigationHelper(this.store, () => this.documentsPerRow());
    this.navigationHelper.onChange(() => this.resetToInitialState());
    this.navigationHelper.onValidNavigation(() => this.getPostIts());
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
    this.postIts.splice(0);
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
      this.getPostIts();
    }
  }

  private getPostIts(): void {
    this.infiniteScroll.startLoading();

    const page = this.subscriptions.length;
    const queryModel = this.navigationHelper.queryWithPagination(page);
    this.fetchQueryDocuments(queryModel);
    this.subscribeOnDocuments(queryModel);
  }

  public createPostIt(document: DocumentModel): void {
    const newPostIt = this.documentModelToPostItModel(document);
    this.postIts.unshift(newPostIt);

    setTimeout(() => {
      this.selectAndFocusCreatedPostIt(newPostIt);
    });
  }

  private selectAndFocusCreatedPostIt(newPostIt: PostItDocumentModel) {
    this.selectionHelper.select(this.createdPostItPreferredColumn(newPostIt), 0, newPostIt);
    this.selectionHelper.setEditMode(true);
    this.selectionHelper.focus();
  }

  private createdPostItPreferredColumn(focusedPostIt: PostItDocumentModel): number {
    if (Object.keys(focusedPostIt.document.data).length === 0) {
      return ATTRIBUTE_COLUMN;
    }

    return VALUE_COLUMN;
  }

  public postItChanged(changedPostIt: PostItDocumentModel, document: DocumentModel): void {
    if (this.postItInInitialState(changedPostIt, document)) {
      return;
    }

    if (!changedPostIt.initialized) {
      this.initializePostIt(changedPostIt, document);
      return;
    }

    this.updateDocument(document);
  }

  public removePostIt(postIt: PostItDocumentModel) {
    if (postIt.initialized) {
      this.store.dispatch(new DeleteConfirm({
        collectionId: postIt.document.collectionId,
        documentId: postIt.document.id
      }));

    } else {
      this.deletionHelper.deletePostIt(postIt);
    }
  }

  private postItInInitialState(postIt: PostItDocumentModel, document: DocumentModel): boolean {
    const isUninitialized = !postIt.initialized;
    const hasInitialAttributes = Object.keys(document.data).length === this.getCollection(postIt).attributes.length;
    const hasInitialValues = Object.values(document.data).every(d => d.value === '');
    const hasNotNewValues = isNullOrUndefined(document.newData) || Object.keys(document.newData).length === 0;

    return isUninitialized && hasInitialAttributes && hasInitialValues && hasNotNewValues;
  }

  public getCollection(postIt: PostItDocumentModel): CollectionModel {
    const collectionId = postIt && postIt.document && postIt.document.collectionId;
    return collectionId && this.collections[collectionId];
  }

  private subscribeOnDocuments(queryModel: QueryModel) {
    const subscription = this.store.select(selectDocumentsByCustomQuery(queryModel)).pipe(
      filter(() => this.canFetchDocuments())
    ).subscribe(documents => {
      this.updateLayoutWithDocuments(documents);
    });

    this.subscriptions.push(subscription);
  }

  private canFetchDocuments() {
    return this.navigationHelper.validNavigation();
  }

  private updateLayoutWithDocuments(documents: DocumentModel[]) {
    this.checkAllLoaded(documents);
    this.addDocumentsNotInLayout(documents);
    this.refreshExistingDocuments(documents);
    this.focusNewDocumentIfPresent(documents);

    this.infiniteScroll.finishLoading();
    this.layoutManager.refresh();
  }

  private refreshExistingDocuments(documents: DocumentModel[]) {
    for (let document of documents) {
      const index = this.postIts.findIndex(pi => pi.document.id === document.id);
      if (index !== -1) {
        const postIt = {...this.postIts[index], document};
        this.postIts.splice(index, 1, postIt);
      }
    }
  }

  private addDocumentsNotInLayout(documents: DocumentModel[]): void {
    const usedDocumentIDs = new Set(this.postIts.map(postIt => postIt.document.id));
    documents
      .filter(documentModel => !usedDocumentIDs.has(documentModel.id))
      .forEach(documentModel => {
        this.postIts.push(this.documentModelToPostItModel(documentModel));
      });
  }

  private focusNewDocumentIfPresent(documents: DocumentModel[]): void {
    const newDocument = documents.find(document => document.correlationId === this.createdDocumentCorrelationId);

    if (newDocument) {
      this.focusDocument(newDocument);
      this.createdDocumentCorrelationId = null;
    }
  }

  private focusDocument(document: DocumentModel): void {
    const focusedPostIt = this.findPostItOfDocument(document);

    setTimeout(() => {
      this.selectPostIt(focusedPostIt);
    });
  }

  private selectPostIt(focusedPostIt: PostItDocumentModel) {
    this.selectionHelper.select(0, 0, focusedPostIt);
  }

  private findPostItOfDocument(document: DocumentModel): PostItDocumentModel {
    return this.postIts
      .filter(postIt => postIt !== null)
      .find(postIt => postIt.document.id === document.id);
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

  private initializePostIt(postItToInitialize: PostItDocumentModel, document: DocumentModel): void {
    if (postItToInitialize.updating) {
      return;
    }

    this.createdDocumentCorrelationId = postItToInitialize.document.correlationId;
    postItToInitialize.updating = true;

    this.createDocument(document);
    this.postIts.splice(this.postIts.indexOf(postItToInitialize), 1);

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

  private documentModelToPostItModel(documentModel: DocumentModel): PostItDocumentModel {
    const postIt = new PostItDocumentModel();
    postIt.document = documentModel;
    postIt.initialized = Boolean(documentModel.id);

    const direction = this.wasCreatedPreviously(postIt) ? 1 : -1;
    postIt.order = this.postIts.length * direction;

    return postIt;
  }

  private wasCreatedPreviously(postIt: PostItDocumentModel): boolean {
    return postIt.initialized && isNullOrUndefined(postIt.document.correlationId);
  }

  public postItWithIndex(postIt: PostItDocumentModel, index: number): PostItDocumentModel {
    postIt.index = index;
    return postIt;
  }

  private documentsPerRow(): number {
    const postItWidth = 225;
    const layoutWidth = this.layoutElement.nativeElement.clientWidth;

    return Math.max(1, Math.floor(layoutWidth / postItWidth));
  }

  public getCollectionRoles(postIt: PostItDocumentModel): string[] {
    return this.collectionRoles && this.collectionRoles[postIt.document.collectionId] || [];
  }

  private sortByOrder(item: any, element: HTMLElement): number {
    return Number(element.getAttribute('order'));
  }

  public trackByDocument(index: number, postIt: PostItDocumentModel): number {
    return HashCodeGenerator.hashString(postIt.document.id || postIt.document.correlationId);
  }

  public ngOnDestroy(): void {
    if (this.navigationHelper) {
      this.navigationHelper.destroy();
    }

    if (this.infiniteScroll) {
      this.infiniteScroll.destroy();
    }

    if (this.collectionsSubscription) {
      this.collectionsSubscription.unsubscribe();
    }

    this.subscriptions.forEach(subscription => subscription.unsubscribe());
  }

}
