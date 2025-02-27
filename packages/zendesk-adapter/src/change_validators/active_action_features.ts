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
import {
  ChangeError,
  ChangeValidator, ElemID, getChangeData, isAdditionOrModificationChange,
  isInstanceChange, Value,
} from '@salto-io/adapter-api'
import { logger } from '@salto-io/logging'
import {
  AUTOMATION_TYPE_NAME,
  CUSTOM_TICKET_STATUS_ACTION,
  DEFLECTION_ACTION,
  MACRO_TYPE_NAME,
  TRIGGER_TYPE_NAME,
  ZENDESK,
} from '../constants'
import { ACCOUNT_SETTING_TYPE_NAME } from '../filters/account_settings'

const log = logger(module)

const TYPES_WITH_ACTIONS = [TRIGGER_TYPE_NAME, MACRO_TYPE_NAME, AUTOMATION_TYPE_NAME]

type SettingsInstance = {
  value: {
    // eslint-disable-next-line camelcase
    active_features: {
      // eslint-disable-next-line camelcase
      automatic_answers?: boolean
    }
    tickets: {
      // eslint-disable-next-line camelcase
      custom_statuses_enabled?: boolean
    }
  }
}

const isValidSettings = (instance: Value): instance is SettingsInstance =>
  _.isPlainObject(instance?.value)
  && _.isPlainObject(instance.value.active_features)
  && _.isPlainObject(instance.value.tickets)


export const DEFLECTION_ZENDESK_FIELD = 'Autoreply with articles'
export const CUSTOM_TICKET_STATUS_ZENDESK_FIELD = 'Ticket status'

// Path in account_settings, action name in the nacl, action name in the service
const featurePathActionTypeAndField = [
  {
    featurePath: ['active_features', 'automatic_answers'],
    actionField: DEFLECTION_ACTION,
    actionZendeskField: DEFLECTION_ZENDESK_FIELD,
  },
  {
    featurePath: ['tickets', 'custom_statuses_enabled'],
    actionField: CUSTOM_TICKET_STATUS_ACTION,
    actionZendeskField: CUSTOM_TICKET_STATUS_ZENDESK_FIELD,
  },
]

/**
 * Validates that if an action is added or modified, the environment has the feature for it activated
 */
export const activeActionFeaturesValidator: ChangeValidator = async (
  changes, elementSource
) => {
  const relevantInstances = changes
    .filter(isAdditionOrModificationChange)
    .filter(isInstanceChange)
    .map(getChangeData)
    .filter(instance => TYPES_WITH_ACTIONS.includes(instance.elemID.typeName))

  if (relevantInstances.length === 0) {
    return []
  }

  if (elementSource === undefined) {
    log.error('Failed to run activeActionFeaturesValidator because element source is undefined')
    return []
  }

  const accountSettings = await elementSource.get(
    new ElemID(ZENDESK, ACCOUNT_SETTING_TYPE_NAME, 'instance', ElemID.CONFIG_NAME)
  )

  if (!isValidSettings(accountSettings)) {
    log.error('Failed to run deflectionActionValidator because account settings instance is invalid')
    return []
  }

  const errors = featurePathActionTypeAndField.flatMap(({ featurePath, actionField, actionZendeskField }) => {
    const isFeatureOn = _.get(accountSettings.value, featurePath)
    if (isFeatureOn === true) {
      return []
    }
    const featureName = featurePath.slice(-1)[0]
    return relevantInstances
      .filter(instance => (instance.value.actions ?? [])
        .some((action: Value) => _.isPlainObject(action) && action.field === actionField))
      .map((instance): ChangeError => ({
        elemID: instance.elemID,
        severity: 'Error',
        message: `Action requires turning on ${featureName} feature`,
        detailedMessage: `To enable the configuration of the '${actionField}' field action, which allows for '${actionZendeskField}', please ensure that the ${featureName} feature is turned on. To do so, please update the '${featurePath.join('.')}' setting to 'true' in the account_settings.`,
      }))
  })
  return errors
}
