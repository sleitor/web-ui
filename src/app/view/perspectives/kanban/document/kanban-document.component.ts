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

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';

import {Store} from '@ngrx/store';
import {isNullOrUndefined} from 'util';
import {AppState} from '../../../../core/store/app.state';
import {KeyCode} from '../../../../shared/key-code';
import {Role} from '../../../../core/model/role';
import {KanbanDocumentModel} from '../document-data/kanban-document-model';
import {NavigationHelper} from '../util/navigation-helper';
import {SelectionHelper} from '../util/selection-helper';
import {AttributeModel, CollectionModel} from '../../../../core/store/collections/collection.model';
import {KanbanColumnLayout} from '../../../../shared/utils/layout/kanban-column-layout';
import {DocumentModel} from '../../../../core/store/documents/document.model';
import {Subject} from 'rxjs';
import {Subscription} from 'rxjs';
import {debounceTime, filter} from 'rxjs/operators';
import {CorrelationIdGenerator} from '../../../../core/store/correlation-id.generator';
import {getDefaultAttributeId} from '../../../../core/store/collections/collection.util';
import {KanbanRow} from './kanban-row';

@Component({
  selector: 'kanban-document',
  templateUrl: './kanban-document.component.html',
  styleUrls: ['./kanban-document.component.scss']
})
export class KanbanDocumentComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() public kanbanModel: KanbanDocumentModel;
  @Input() public collection: CollectionModel;
  @Input() public collectionRoles: string[];
  @Input() public perspectiveId: string;
  @Input() private currentColumnLayoutManager: KanbanColumnLayout;
  @Input() public navigationHelper: NavigationHelper;
  @Input() public selectionHelper: SelectionHelper;
  @Input() public onReleaseDocument: EventEmitter<any>;

  @Output() public remove = new EventEmitter();
  @Output() public changes = new EventEmitter();
  @Output() public moveKanban = new EventEmitter();
  @Output() public favoriteChange = new EventEmitter<{ favorite: boolean, onlyStore: boolean }>();

  @ViewChild('content') public content: ElementRef;

  private kanbanRows: KanbanRow[] = [];
  private kanbanNewRow: KanbanRow = {attributeName: '', value: ''};
  private kanbanChange$ = new Subject<any>();
  private kanbanChangeSubscription: Subscription;

  private lastSyncedFavorite: boolean;
  private favoriteChange$ = new Subject<boolean>();
  private favoriteChangeSubscription: Subscription;

  constructor(private store: Store<AppState>,
              private element: ElementRef,
              private ref: ChangeDetectorRef) {
  }

  public ngOnChanges(changes: SimpleChanges) {
    if (changes.collection) {
      this.pairAttributes();
    }
    if (changes.kanbanModel) {
      this.constructRows();
    }
    this.kanbanModel.numRows = this.kanbanRows.length;
  }

  public ngOnInit(): void {
    this.kanbanModel.element = this.element;
    this.disableScrollOnNavigation();
    this.initFavoriteSubscription();
  }

  public ngAfterViewInit(): void {
    this.addDocumentToColumn();
    this.onReleaseDocument.subscribe((request) => {
      if (this.kanbanModel.index === request.kanban.index) {
        this.kanbanRows.map((kR, index) => {
          if (kR.attributeId === request.newColumnModel.rowId) {
            const selectedRow = index;
            kR.value = request.newColumnModel.name;
            this.updateValue(selectedRow);
            // ApplicationRef.bootstrap();
            this.ref.detectChanges();
          }
        });
      }
    });

  }

  public ngOnDestroy(): void {
    if (this.kanbanChangeSubscription) {
      this.kanbanChangeSubscription.unsubscribe();
    }
    this.currentColumnLayoutManager.remove(this.kanbanModel);
  }

  private addDocumentToColumn() {
    if (this.currentColumnLayoutManager) {
      this.currentColumnLayoutManager.add(this.kanbanModel);
      this.kanbanModel.columnIndex = this.currentColumnLayoutManager.index;
    }
  }

  private disableScrollOnNavigation(): void {
    const capture = false;
    const scrollKeys = [KeyCode.UpArrow, KeyCode.DownArrow];

    this.content.nativeElement.addEventListener('keydown', (key: KeyboardEvent) => {
      if (scrollKeys.includes(key.keyCode)) {
        key.preventDefault();
      }
    }, capture);
  }

  public clickOnAttributePair(column: number, row: number): void {
    this.selectionHelper.setEditMode(false);
    this.selectionHelper.select(column, row, this.kanbanModel);
  }

  public onEnterKeyPressedInEditMode(): void {
    this.selectionHelper.selectNext(this.kanbanModel);
  }

  public createAttributePair(): void {
    const selectedAttribute = this.findAttributeByName(this.kanbanNewRow.attributeName);

    if (selectedAttribute) {
      if (this.isAttributeUsed(selectedAttribute.id)) {
        return;
      }

      this.kanbanRows.push({...this.kanbanNewRow, attributeId: selectedAttribute.id});
    } else {
      this.kanbanRows.push({...this.kanbanNewRow, correlationId: CorrelationIdGenerator.generate()});
    }

    this.kanbanModel.numRows = this.kanbanRows.length;

    this.kanbanNewRow = {attributeName: '', value: ''};
    this.onChange();

    setTimeout(() => {
      this.selectionHelper.select(1, this.kanbanRows.length, this.kanbanModel);
    });
  }

  public onUpdateAttribute(selectedRow: number): void {
    const data = this.kanbanRows[selectedRow];
    if (!data) {
      return;
    }

    this.onChange();

    data.attributeName = data.attributeName.trim();
    if (!data.attributeName) {
      this.removeRow(selectedRow);
      return;
    }

    const selectedAttribute = this.findAttributeByName(data.attributeName);
    if (data.attributeId && selectedAttribute && selectedAttribute.id !== data.attributeId && this.isAttributeUsed(selectedAttribute.id)) {
      const previousAttribute = this.findAttributeById(data.attributeId);
      data.attributeName = previousAttribute.name;
    } else {
      data.attributeId = selectedAttribute && selectedAttribute.id || null;
      if (isNullOrUndefined(data.attributeId) && isNullOrUndefined(data.correlationId)) {
        data.correlationId = CorrelationIdGenerator.generate();
      }
    }
  }

  public updateValue(selectedRow: number): void {
    const data = this.kanbanRows[selectedRow];
    if (!data) {
      return;
    }

    data.value = data.value.trim();
    const oldValue = '' + this.kanbanModel.document.data[data.attributeId];
    this.onChange();
    if (data.value !== oldValue) {
      const request = {kanban: this.kanbanModel, newColumn: data.value, oldColumnIndex: this.kanbanModel.columnIndex };
      this.moveKanban.emit(request);
    }
  }

  public toggleFavorite() {
    if (isNullOrUndefined(this.lastSyncedFavorite)) {
      this.lastSyncedFavorite = this.kanbanModel.document.favorite;
    }

    const value = !this.kanbanModel.document.favorite;
    this.favoriteChange$.next(value);
    this.favoriteChange.emit({favorite: value, onlyStore: true});
  }

  public onRemove(): void {
    if (this.kanbanChangeSubscription) {
      this.kanbanChangeSubscription.unsubscribe();
      this.kanbanChangeSubscription = null;
    }

    this.remove.emit();
  }

  public removeRow(selectedRow: number) {
    this.kanbanRows.splice(selectedRow, 1);

    this.kanbanModel.numRows = this.kanbanRows.length;

    setTimeout(() => {
      this.selectionHelper.select(
        this.selectionHelper.selection.column,
        this.selectionHelper.selection.row - 1,
        this.kanbanModel
      );
    });

    if (this.kanbanRows.length === 0) {
      this.onRemove();
    }
  }

  public removeValue(selectedRow: number) {
    this.kanbanRows[selectedRow].value = '';
  }

  public unusedAttributes(): AttributeModel[] {
    return this.collection.attributes.filter(attribute => {
      return isNullOrUndefined(this.kanbanRows.find(d => d.attributeId === attribute.id));
    });
  }

  public findAttributeByName(name: string): AttributeModel {
    return this.collection.attributes.find(attr => attr.name === name);
  }

  public findAttributeById(id: string): AttributeModel {
    return this.collection.attributes.find(attr => attr.id === id);
  }

  public isAttributeUsed(id: string) {
    return this.kanbanRows.findIndex(d => d.attributeId === id) !== -1;
  }

  public suggestionListId(): string {
    return `${ this.perspectiveId }${ this.kanbanModel.document.id || 'uninitialized' }`;
  }

  public isDefaultAttribute(attributeId: string): boolean {
    return attributeId && attributeId === getDefaultAttributeId(this.collection);
  }

  public hasWriteRole(): boolean {
    return this.collectionRoles && this.collectionRoles.includes(Role.Write);
  }

  private pairAttributes() {
    if (isNullOrUndefined(this.collection)) {
      return;
    }

    this.collection.attributes.forEach(attribute => {
      const row = this.kanbanRows.find(row => row.correlationId && row.correlationId === attribute.correlationId);
      if (row) {
        row.attributeId = attribute.id;
        row.correlationId = null;
      }
    });
  }

  private constructRows() {
    if (isNullOrUndefined(this.kanbanModel)) {
      return;
    }

    Object.keys(this.kanbanModel.document.data).forEach(attributeId => {
      const row = this.kanbanRows.find(row => row.attributeId === attributeId);
      if (!row) {
        const attribute = this.findAttributeById(attributeId);
        if (attribute) {
          const attributeName = attribute && attribute.name || '';
          this.kanbanRows.push({attributeId, attributeName, value: this.kanbanModel.document.data[attributeId]});
        }
      }
    });
  }

  private onChange() {
    if (isNullOrUndefined(this.kanbanChangeSubscription)) {
      this.initSubscription();
    }
    this.kanbanChange$.next();
  }

  private initSubscription() {
    this.kanbanChangeSubscription = this.kanbanChange$.pipe(
      debounceTime(500),
    ).subscribe(() => {
      this.changes.emit(this.createUpdateDocument());
    });
  }

  private createUpdateDocument(): DocumentModel {
    const data: { [attributeId: string]: any } = this.kanbanRows.filter(row => row.attributeId).reduce((acc, row) => {
      acc[row.attributeId] = row.value;
      return acc;
    }, {});

    const newData: { [attributeName: string]: any } = this.kanbanRows.filter(row => isNullOrUndefined(row.attributeId))
      .reduce((acc: { [attributeName: string]: any }, row) => {
        acc[row.attributeName] = {value: row.value, correlationId: row.correlationId};
        return acc;
      }, {});

    return {...this.kanbanModel.document, data, newData: Object.keys(newData).length > 0 ? newData : null};
  }

  private initFavoriteSubscription() {
    this.favoriteChangeSubscription = this.favoriteChange$.pipe(
      debounceTime(1000),
      filter(favorite => favorite !== this.lastSyncedFavorite)
    ).subscribe(favorite => {
      this.lastSyncedFavorite = null;
      this.favoriteChange.emit({favorite, onlyStore: false});
    });
  }
}
