import {AfterViewInit, Component, ElementRef, Input, NgZone, OnInit} from '@angular/core';
import {KanbanPerspectiveComponent} from '../kanban-perspective.component';
import {KanbanColumnSortingLayout} from '../../../../shared/utils/layout/kanban-column-sorting-layout';
import {KanbanColumnLayoutConfig} from '../../../../shared/utils/layout/kanban-column-layout-config';
import {KanbanColumnLayout} from '../../../../shared/utils/layout/kanban-column-layout';
import {KanbanLayoutConfig} from '../../../../shared/utils/layout/kanban-layout-config';

@Component({
  selector: 'kanban-column',
  templateUrl: './kanban-column.component.html',
  styleUrls: ['./kanban-column.component.scss']
})
export class KanbanColumnComponent implements OnInit, AfterViewInit {

  private kanbanColumnLayoutConfig = new KanbanColumnLayoutConfig();

  @Input()
  public columnLayoutManager: KanbanColumnLayout;

  @Input()
  public id: String;
  private layoutColumnManager: KanbanColumnLayout;
  private static documents: any[] = [];

  constructor(private zone: NgZone, private element: ElementRef) { }

  public ngOnInit() {
    console.log('id', this.id);
    this.layoutColumnManager = new KanbanColumnSortingLayout(
      '.kanban-document-layout',
      new KanbanLayoutConfig(),
      // this.sortByOrder,
      '',
      this.zone,
      this.element,
      KanbanColumnComponent.documents
    );
    KanbanPerspectiveComponent.columnLayoutManagers.push(this.layoutColumnManager);
  }

  public ngAfterViewInit(): void {
    this.columnLayoutManager =
      new KanbanColumnSortingLayout(
        '.kanban-column-layout',
        this.kanbanColumnLayoutConfig,
        // this.sortByOrder,
        '',
        this.zone,
        this.element,
        KanbanPerspectiveComponent.columns
      );
  }
  // private sortByOrder(item: any, element: HTMLElement): number {
  //   return Number(element.getAttribute('order'));
  // }

}
