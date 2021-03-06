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

export enum Perspective {
  Detail = 'detail',
  Search = 'search',
  Table2 = 'table',
  PostIt = 'postit',
  Kanban = 'kanban',
  Chart = 'chart',
  SmartDoc = 'smartdoc',
  Table = 'table-old',
}

export const perspectivesMap: { [id: string]: Perspective } = {
  [Perspective.Detail]: Perspective.Detail,
  [Perspective.PostIt]: Perspective.PostIt,
  [Perspective.Kanban]: Perspective.Kanban,
  [Perspective.Chart]: Perspective.Chart,
  [Perspective.Search]: Perspective.Search,
  [Perspective.SmartDoc]: Perspective.SmartDoc,
  [Perspective.Table]: Perspective.Table,
  [Perspective.Table2]: Perspective.Table2
};

export const perspectiveIconsMap: { [id: string]: string } = {
  [Perspective.Detail]: 'far fa-map-marker-alt',
  [Perspective.PostIt]: 'far fa-sticky-note',
  [Perspective.Kanban]: 'far fa-clipboard',
  [Perspective.Chart]: 'far fa-chart-area',
  [Perspective.Search]: 'far fa-search',
  [Perspective.SmartDoc]: 'far fa-file-alt',
  [Perspective.Table]: 'far fa-table',
  [Perspective.Table2]: 'far fa-table'
};
