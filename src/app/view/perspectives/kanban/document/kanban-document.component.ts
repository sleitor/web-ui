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

import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {Store} from '@ngrx/store';
import {isString} from 'util';
import {Permission} from '../../../../core/dto';
import {LumeerError} from '../../../../core/error/lumeer.error';
import {AppState} from '../../../../core/store/app.state';
import {DocumentsAction} from '../../../../core/store/documents/documents.action';
import {KeyCode} from '../../../../shared/key-code';
import {Role} from '../../../../core/model/role';
import {AttributePair} from '../document-data/attribute-pair';
import {KanbanDocumentModel} from '../document-data/kanban-document-model';
import {NavigationHelper} from '../util/navigation-helper';
import {SelectionHelper} from '../util/selection-helper';
import {AttributeModel} from '../../../../core/store/collections/collection.model';
import DeleteConfirm = DocumentsAction.DeleteConfirm;
import Update = DocumentsAction.Update;
import {KanbanLayout} from '../../../../shared/utils/layout/kanban-layout';
import {KanbanColumnLayout} from '../../../../shared/utils/layout/kanban-column-layout';
import {KanbanColumnLayoutConfig} from '../../../../shared/utils/layout/kanban-column-layout-config';
import {KanbanColumnSortingLayout} from '../../../../shared/utils/layout/kanban-column-sorting-layout';

@Component({
  selector: 'kanban-document',
  templateUrl: './kanban-document.component.html',
  styleUrls: ['./kanban-document.component.scss']
})
export class KanbanDocumentComponent implements OnInit, AfterViewInit, OnDestroy {

  private static columns: any[] = [];

    @HostListener('focusout')
  public onFocusOut(): void {
    if (this.shouldSuggestDeletion()) {
      this.confirmDeletion();
      this.changed = false;
      return;
    }

    if (this.changed) {
      this.checkforDuplicitAttributes();

      this.changed = false;
      this.changes.emit();
    }
  }

  private shouldSuggestDeletion(): boolean {
    return this.hasNoAttributes() && this.isInitialized();
  }

  private hasNoAttributes(): boolean {
    return this.attributePairs.length === 0;
  }

  private isInitialized(): boolean {
    return Boolean(this.kanbanModel && this._kanbanModel.document.id);
  }

  private checkforDuplicitAttributes(): void {
    const attributesCount = Object.keys(this.kanbanModel.document.data).length;
    const userWrittenAttributesCount = this.attributePairs.length;

    if (attributesCount !== userWrittenAttributesCount) {
      console.warn('You added more values to single attribute, we suggest refreshing');
    }
  }

  private _kanbanModel: KanbanDocumentModel;

  @Input()
  public get kanbanModel() {
    return this._kanbanModel;
  }

  public set kanbanModel(value) {
    if (!value) {
      throw new LumeerError('Invalid internal state');
    }

    this._kanbanModel = value;
    this.refreshDataAttributePairs();
  }

  @Input()
    public collectionRoles: string[];

  @Input()
  public perspectiveId: string;

  @Input()
  public layoutManager: KanbanLayout;

  @Input()
  public columnLayoutManager: KanbanColumnLayout;

  @Input()
  public navigationHelper: NavigationHelper;

  @Input()
  public selectionHelper: SelectionHelper;

  @Output()
  public removed = new EventEmitter();

  @Output()
  public changes = new EventEmitter();

  @ViewChild('content')
  public content: ElementRef;

  private changed: boolean;

  public attributePairs: AttributePair[] = [];

  public newAttributePair: AttributePair = new AttributePair();

  constructor(private store: Store<AppState>,
              private zone: NgZone,
              private element: ElementRef) {
  }

  private kanbanColumnLayoutConfig = new KanbanColumnLayoutConfig();
  public ngOnInit(): void {
    this.disableScrollOnNavigation();
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

  public ngAfterViewInit(): void {
    this.layoutManager.add(this.element.nativeElement);
    this.columnLayoutManager =
      new KanbanColumnSortingLayout(
        '.kanban-column-layout',
        this.kanbanColumnLayoutConfig,
        // this.sortByOrder,
        'li',
        this.zone,
        this.element,
        KanbanDocumentComponent.columns
      );
  }

    public clickOnAttributePair(column: number, row: number): void {
        this.selectionHelper.setEditMode(false);
        this.selectionHelper.select(column, row, this.kanbanModel);
    }

  public onEnterKeyPressedInEditMode(): void {
    this.selectionHelper.selectNext(this.kanbanModel);
  }

  public createAttributePair(): void {
    this.kanbanModel.document.data[this.newAttributePair.attribute] = '';

    this.newAttributePair.value = '';
    this.attributePairs.push(this.newAttributePair);

    this.newAttributePair = {} as AttributePair;
    document.activeElement['value'] = '';

    this.changed = true;

    setTimeout(() => {
      this.selectionHelper.select(1, Number.MAX_SAFE_INTEGER, this.kanbanModel);
    });
  }

  public updateAttribute(attributePair: AttributePair): void {
    attributePair.attribute = attributePair.attribute.trim();

    delete this.kanbanModel.document.data[attributePair.previousAttributeName];
    attributePair.previousAttributeName = attributePair.attribute;

    if (attributePair.attribute) {
      this.kanbanModel.document.data[attributePair.attribute] = attributePair.value;

    } else {
      this.removeAttributePair();
    }

    this.changed = true;
  }

  public updateValue(attributePair: AttributePair): void {
    attributePair.value = attributePair.value.trim();

    if (this.kanbanModel.document.data[attributePair.attribute] !== attributePair.value) {
      this.changed = true;
    }

    this.kanbanModel.document.data[attributePair.attribute] = attributePair.value;
  }

  public toggleDocumentFavorite() {
    this.store.dispatch(new Update({document: this.kanbanModel.document, toggleFavourite: true}));
  }

  public confirmDeletion(): void {
    if (this.kanbanModel.initialized) {
      this.store.dispatch(new DeleteConfirm({
        collectionId: this.kanbanModel.document.collectionId,
        documentId: this.kanbanModel.document.id
      }));

    } else {
      this.removed.emit();
    }
  }

  private sortByOrder(item: any, element: HTMLElement): number {
      return Number(element.getAttribute('order'));
  }

  private removeAttributePair() {
  const selectedRow = this.selectionHelper.selection.row;
  this.attributePairs.splice(selectedRow, 1);

    setTimeout(() => {
      this.selectionHelper.select(
        this.selectionHelper.selection.column,
        this.selectionHelper.selection.row - 1,
        this.kanbanModel
      );
    });
  }

  public removeValue() {
    const selectedRow = this.selectionHelper.selection.row;
    this.attributePairs[selectedRow].value = '';
  }

  private refreshDataAttributePairs(): void {
    if (!this.kanbanModel.document.data) {
      this.kanbanModel.document.data = {};
    }

    this.attributePairs = Object.entries(this.kanbanModel.document.data)
      .sort(([attribute1, value1], [attribute2, value2]) => attribute1.localeCompare(attribute2))
      .map(([attribute, value]) => {
        return {
          attribute: attribute,
          previousAttributeName: attribute,
          value: isString(value) ? value : JSON.stringify(value, null, 2)
        };
      });
  }

  public unusedAttributes(): AttributeModel[] {
    return this.kanbanModel.document.collection.attributes.filter(attribute => {
      return this.kanbanModel.document.data[attribute.id] === undefined;
    });
  }

  public suggestionListId(): string {
    return `${ this.perspectiveId }${ this.kanbanModel.document.id || 'uninitialized' }`;
  }

  public isDefaultAttribute(attributeFullName: string): boolean {
    return attributeFullName === this.kanbanModel.document.collection.defaultAttributeId;
  }

  public hasWriteRole(): boolean {
    return this.hasRole(Role.Write);
  }

  private hasRole(role: string): boolean {
    const collection = this.kanbanModel.document.collection;
    const permissions = collection && collection.permissions || {users: [], groups: []};
    return permissions.users.some((permission: Permission) => permission.roles.includes(role));
  }

  public ngOnDestroy(): void {
    this.layoutManager.remove(this.element.nativeElement);
  }

}
