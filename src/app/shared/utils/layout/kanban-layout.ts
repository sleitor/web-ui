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
import {KanbanLayoutConfig} from './kanban-layout-config';

export class KanbanLayout {

  protected layout: any;

  protected insertingElementsAtIndex: number = 0;

  constructor(protected containerClassName: string, protected parameters: KanbanLayoutConfig, protected zone: NgZone, protected element: ElementRef, public columns: any[]) {
    this.addContainerClassIdentifierIfMissing();
  }

  private addContainerClassIdentifierIfMissing(): void {
    if (!this.containerClassName.startsWith('.')) {
      this.containerClassName = '.' + this.containerClassName;
    }
  }

  public initialize(): void {
    this.isInitializedAffterAttempt();
  }

  public add(element: HTMLElement): void {
    if (!this.isInitializedAffterAttempt()) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.layout.add(element, {index: this.insertingElementsAtIndex});
      this.relayout();
    });
  }

  public remove(element: HTMLElement): void {
    if (!this.isInitializedAffterAttempt()) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.layout.remove(element);
      this.relayout();
    });
  }

  protected relayout(): void {
    setTimeout(() => {
      this.layout
        .refreshItems()
        .synchronize()
        .layout();
    });
  }

  public refresh(): void {
    if (this.isInitializedAffterAttempt()) {
      this.relayout();
    }
  }

  protected isInitializedAffterAttempt(): boolean {
    if (!this.containerExists()) {
      return false;
    }

    if (!this.layout) {
      this.createLayout();
    }

    return true;
  }

  private createLayout(): void {
    const layout = this.element.nativeElement.querySelectorAll(this.containerClassName);
    const columns = this.columns;
    layout.forEach((l) => {
      this.parameters.dragSort = () => columns;
      this.zone.runOutsideAngular(() => {
        this.layout = new window['Muuri'](l, this.parameters);
        this.columns.push(this.layout);
      });

    });

  }

  protected containerExists(): boolean {
    return !!(document.querySelector(this.containerClassName));
  }

}
