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

import {ElementRef, NgZone} from '@angular/core';
import {KanbanColumnLayout} from './kanban-column-layout';
import {KanbanColumnLayoutConfig} from './kanban-column-layout-config';

export class KanbanColumnSortingLayout extends KanbanColumnLayout {

    constructor(containerClassName: string,
                parameters: KanbanColumnLayoutConfig,
                // sortFunction: (item: any, element: HTMLElement) => number,
                selectorOfDraggableElements: string,
                zone: NgZone,
                element: ElementRef,
                columns: any[],
                columnIndex) {

    super(containerClassName, parameters, zone, element, columns, columnIndex);
    this.setSortingParameters(selectorOfDraggableElements);
  }

  private setSortingParameters(selectorOfDraggableElements: string) {
    this.parameters.dragEnabled = true;

    this.parameters.layoutOnInit = false;

    this.parameters.dragStartPredicate = {
      distance: 15,
      delay: 40,
      handle: selectorOfDraggableElements
    };

    // this.parameters.sortData = {
    //   order: sortFunction
    // };
  }

  protected relayout(): void {
    setTimeout(() => {
      this.layout
        .refreshSortData()
        .refreshItems()
        .sort('order');
    });
  }

}
