import {AfterViewInit, Component, ElementRef, Input, NgZone, OnInit} from '@angular/core';
import {KanbanPerspectiveComponent} from '../kanban-perspective.component';
import {KanbanColumnSortingLayout} from '../../../../shared/utils/layout/kanban-column-sorting-layout';
import {KanbanColumnLayoutConfig} from '../../../../shared/utils/layout/kanban-column-layout-config';
import {KanbanColumnLayout} from '../../../../shared/utils/layout/kanban-column-layout';

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

  constructor(private zone: NgZone, private element: ElementRef) { }

  public ngOnInit() {
    console.log('id', this.id);
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

}
