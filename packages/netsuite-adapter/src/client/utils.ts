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
import { strings, values } from '@salto-io/lowerdash'
import { safeJsonStringify } from '@salto-io/adapter-utils'
import { logger } from '@salto-io/logging'
import { Change, ElemID, SaltoElementError, getChangeData, isAdditionChange } from '@salto-io/adapter-api'
import { FILE, FOLDER } from '../constants'
import { CustomizationInfo, CustomTypeInfo, DeployableChange, FileCustomizationInfo, FolderCustomizationInfo, SDFObjectChangeType, TemplateCustomTypeInfo } from './types'
import { NetsuiteTypesQueryParams } from '../query'
import { ConfigRecord } from './suiteapp_client/types'
import { isFileCabinetInstance } from '../types'
import { getServiceIdsToElemIds } from '../service_id_info'

const log = logger(module)
const { matchAll } = strings
const { isDefined } = values

export const toError = (e: unknown): Error => {
  if (e instanceof Error) {
    return e
  }
  if (typeof e === 'string') {
    return new Error(e)
  }
  return new Error(safeJsonStringify(e))
}

export const isCustomTypeInfo = (customizationInfo: CustomizationInfo):
  customizationInfo is CustomTypeInfo => 'scriptId' in customizationInfo

export const isTemplateCustomTypeInfo = (customizationInfo: CustomizationInfo):
  customizationInfo is TemplateCustomTypeInfo =>
  'fileExtension' in customizationInfo && isCustomTypeInfo(customizationInfo)

export const isFileCustomizationInfo = (customizationInfo: CustomizationInfo):
  customizationInfo is FileCustomizationInfo =>
  customizationInfo.typeName === FILE

export const isFolderCustomizationInfo = (customizationInfo: CustomizationInfo):
  customizationInfo is FolderCustomizationInfo =>
  customizationInfo.typeName === FOLDER

export const mergeTypeToInstances = (
  ...typeToInstances: NetsuiteTypesQueryParams[]
): NetsuiteTypesQueryParams =>
  _.mergeWith(
    {},
    ...typeToInstances,
    (objValue: string[] | undefined, srcValue: string[]) => (
      objValue ? [...objValue, ...srcValue] : srcValue
    )
  )

export const getGroupItemFromRegex = (str: string, regex: RegExp, item: string): string[] =>
  Array.from(matchAll(str, regex))
    .map(r => r.groups)
    .filter(isDefined)
    .map(groups => groups[item])

export const sliceMessagesByRegex = (
  messages: string[],
  lookFromRegex: RegExp,
  includeMatchedRegex = true
): string[] => {
  // remove the global flag of the regex
  const fixedLookedFromRegex = RegExp(lookFromRegex, lookFromRegex.flags.replace('g', ''))
  const matchedMessages = messages.map(message => fixedLookedFromRegex.test(message))
  const lookFromIndex = includeMatchedRegex
    ? matchedMessages.indexOf(true)
    : matchedMessages.lastIndexOf(true)
  return lookFromIndex !== -1
    ? messages.slice(lookFromIndex + (includeMatchedRegex ? 0 : 1))
    : []
}

export const getConfigRecordsFieldValue = (
  configRecord: ConfigRecord | undefined,
  field: string,
): unknown => configRecord?.data?.fields?.[field]

export const toElementError = (
  elemID: ElemID,
  message: string
): SaltoElementError => ({
  elemID,
  message,
  severity: 'Error',
})

export const toDependencyError = (
  dependency: { elemId: ElemID; dependOn: ElemID[] }
): SaltoElementError => {
  const dependencies = _.uniq(dependency.dependOn)
  return {
    elemID: dependency.elemId,
    message: `Element cannot be deployed due to an error in its ${
      dependencies.length > 1 ? 'dependencies' : 'dependency'
    }: ${dependencies.map(id => id.getFullName()).join(', ')}`,
    severity: 'Error',
  }
}

export const getDeployResultFromSuiteAppResult = <T extends Change>(
  changes: T[],
  results: (number | Error)[]
): {
  appliedChanges: T[]
  errors: SaltoElementError[]
  elemIdToInternalId: Record<string, string>
} => {
  const errors: SaltoElementError[] = []
  const appliedChanges: T[] = []
  const elemIdToInternalId: Record<string, string> = {}

  results
    .forEach((result, index) => {
      const change = changes[index]
      if (change === undefined) {
        log.warn(
          'deploy result in index %d is beyond the changes list and will be ignored: %o',
          index,
          result,
        )
        return
      }
      const { elemID } = getChangeData(change)
      if (typeof result === 'number') {
        appliedChanges.push(change)
        elemIdToInternalId[elemID.getFullName()] = result.toString()
      } else {
        errors.push(toElementError(elemID, result.message))
      }
    })

  return { appliedChanges, errors, elemIdToInternalId }
}

export const getChangeTypeAndAddedObjects = (
  change: DeployableChange & { action: 'add' | 'modify' }
): SDFObjectChangeType => {
  if (isAdditionChange(change)) {
    return { changeType: 'addition' }
  }
  if (isFileCabinetInstance(getChangeData(change))) {
    return { changeType: 'modification', addedObjects: new Set() }
  }
  const beforeInnerObjects = getServiceIdsToElemIds(change.data.before)
  const afterInnerObjects = getServiceIdsToElemIds(change.data.after)
  const addedInnerObjects = Object.keys(afterInnerObjects)
    .filter(objName => beforeInnerObjects[objName] === undefined)
  log.debug(
    'the following inner objects of %s were added: %o',
    getChangeData(change).elemID.getFullName(),
    addedInnerObjects
  )
  return { changeType: 'modification', addedObjects: new Set(addedInnerObjects) }
}
