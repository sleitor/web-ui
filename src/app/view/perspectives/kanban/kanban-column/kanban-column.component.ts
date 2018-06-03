import {AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnInit, Output} from '@angular/core';
import {KanbanColumnSortingLayout} from '../../../../shared/utils/layout/kanban-column-sorting-layout';
import {KanbanColumnLayout} from '../../../../shared/utils/layout/kanban-column-layout';
import {KanbanLayoutConfig} from '../../../../shared/utils/layout/kanban-layout-config';
import {KanbanColumnModel} from '../document-data/kanban-column-model';
import {KanbanDocumentModel} from '../document-data/kanban-document-model';

@Component({
  selector: 'kanban-column',
  templateUrl: './kanban-column.component.html',
  styleUrls: ['./kanban-column.component.scss']
})
export class KanbanColumnComponent implements OnInit, AfterViewInit {

  @Input()
  public kanbanColumn: KanbanColumnModel;

  @Input()
  public kanbans: KanbanDocumentModel[];

  @Input()
  public columnLayoutManagers: KanbanColumnLayout[];

  @Output() public releaseKanban = new EventEmitter();

  private layoutColumnManager: KanbanColumnLayout;

  private muuriColumn: any;
  private static muuriColumns: any[] = [];
  private static dragStartColumn = -1;

  constructor(private zone: NgZone, private element: ElementRef) { }

  public ngOnInit() {
    this.layoutColumnManager = new KanbanColumnSortingLayout(
      '.kanban-document-layout',
      new KanbanLayoutConfig(),
      // this.sortByOrder,
      '',
      this.zone,
      this.element,
      KanbanColumnComponent.muuriColumns,
      // this.documents,
      this.columnLayoutManagers.length,
    );
    this.columnLayoutManagers.push(this.layoutColumnManager);
    this.layoutColumnManager.muuriColumn = KanbanColumnComponent.muuriColumns[KanbanColumnComponent.muuriColumns.length - 1];
    this.layoutColumnManager.muuriColumn.on('dragStart', () =>  {
      KanbanColumnComponent.dragStartColumn = this.kanbanColumn.managerId;
    });
    this.layoutColumnManager.muuriColumn.on('dragReleaseEnd', (muuriDocument) =>  {
      const domElement = muuriDocument.getElement();
      const documentModel = this.kanbans.find(kanban => kanban.element.nativeElement === domElement);
      this.syncDocument();
      if (documentModel.columnIndex !== KanbanColumnComponent.dragStartColumn && KanbanColumnComponent.dragStartColumn > -1) {
        const request = {kanban: documentModel, newColumnIndex: documentModel.columnIndex, oldColumnIndex: KanbanColumnComponent.dragStartColumn };
        this.releaseKanban.emit(request);
        KanbanColumnComponent.dragStartColumn = -1;
      }
    });
  }

  public ngAfterViewInit(): void {
    setTimeout(() => {
      this.syncDocument();
    });
  }

  private syncDocument() {
    const cLMs = this.columnLayoutManagers;
    cLMs.forEach(cLM => {
      const muuriDocumnets = cLM.muuriColumn.getItems();
      const newDocumentsArray = [];
      muuriDocumnets.forEach(muuriDocument => {
        const domElement = muuriDocument.getElement();
        const newDocument = this.kanbans.find(kanban => kanban.element.nativeElement === domElement);
        if (newDocument) {
          newDocument.columnIndex = cLM.index;
          newDocumentsArray.push(newDocument);
        }
      });
      cLM.documentModels = newDocumentsArray;
      cLM.muuriColumn.layout();
    });

  }

  public static removeEmpryColumns() {
    KanbanColumnComponent.muuriColumns.forEach(mC => {
      console.log(mC.getItems());
    });
  }

  // private sortByOrder(item: any, element: HTMLElement): number {
  //   return Number(element.getAttribute('order'));
  // }

}
