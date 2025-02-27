/*
*                      Copyright 2023 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import { isInstanceElement } from '@salto-io/adapter-api'
import _ from 'lodash'
import { references as referenceUtils } from '@salto-io/adapter-components'
import { FilterCreator } from '../../filter'
import { ISSUE_LAYOUT_TYPE, ISSUE_VIEW_TYPE, REQUEST_FORM_TYPE } from '../../constants'
import { JiraFieldReferenceResolver, contextStrategyLookup, referencesRules } from '../../reference_mapping'

const supportedLayouts = [ISSUE_LAYOUT_TYPE, REQUEST_FORM_TYPE, ISSUE_VIEW_TYPE]

const filter: FilterCreator = ({ config }) => ({
  name: 'createReferencesIssueLayoutFilter',
  onFetch: async elements => {
    const layouts = elements.filter(isInstanceElement).filter(e => supportedLayouts.includes(e.elemID.typeName))
    const fixedDefs = referencesRules
      .map(def => (
        config.fetch.enableMissingReferences ? def : _.omit(def, 'jiraMissingRefStrategy')
      ))
    await referenceUtils.addReferences({
      elements: layouts,
      contextElements: elements,
      fieldsToGroupBy: ['id'],
      defs: fixedDefs,
      contextStrategyLookup,
      fieldReferenceResolverCreator: defs => new JiraFieldReferenceResolver(defs),
    })
  },
})
export default filter
