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

import _ from 'lodash'
import { getChangeData, isInstanceChange, Change, InstanceElement } from '@salto-io/adapter-api'
import { defaultDeployChange, deployChanges } from '../deployment/standard_deployment'
import { FilterCreator } from '../filter'
import { JSM_DUCKTYPE_SUPPORTED_TYPES } from '../config/api_config'

const SUPPORTED_TYPES = new Set(Object.keys(JSM_DUCKTYPE_SUPPORTED_TYPES))

const filterCreator: FilterCreator = ({ config, client }) => ({
  name: 'jsmTypesFilter',
  deploy: async (changes: Change<InstanceElement>[]) => {
    const { jsmApiDefinitions } = config
    if (!config.fetch.enableJSM || jsmApiDefinitions === undefined) {
      return {
        deployResult: { appliedChanges: [], errors: [] },
        leftoverChanges: changes,
      }
    }
    const [jsmTypesChanges, leftoverChanges] = _.partition(
      changes,
      change =>
        SUPPORTED_TYPES.has(getChangeData(change).elemID.typeName)
        && isInstanceChange(change)
    )

    const deployResult = await deployChanges(
      jsmTypesChanges,
      async change => {
        await defaultDeployChange({ change, client, apiDefinitions: jsmApiDefinitions })
      }
    )
    return { deployResult, leftoverChanges }
  },
})

export default filterCreator
