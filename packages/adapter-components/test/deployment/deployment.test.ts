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
import { BuiltinTypes, CORE_ANNOTATIONS, ElemID, InstanceElement, ObjectType, toChange } from '@salto-io/adapter-api'
import { mockFunction, MockInterface } from '@salto-io/test-utils'
import { HTTPWriteClientInterface } from '../../src/client/http_client'
import { deployChange, filterUndeployableValues } from '../../src/deployment/deployment'
import { DeploymentRequestsByAction } from '../../src/config/request'

describe('deployChange', () => {
  let type: ObjectType
  let instance: InstanceElement
  let httpClient: MockInterface<HTTPWriteClientInterface>
  let endpoint: DeploymentRequestsByAction

  beforeEach(() => {
    type = new ObjectType({
      elemID: new ElemID('adapter', 'test'),
      fields: {
        id: { refType: BuiltinTypes.STRING },
        creatableField: {
          refType: BuiltinTypes.STRING,
          annotations: { [CORE_ANNOTATIONS.CREATABLE]: true },
        },
      },
    })

    instance = new InstanceElement(
      'instance',
      type,
      {
        creatableField: 'creatableValue',
        ignored: 'ignored',
      }
    )

    endpoint = {
      add: {
        url: '/test/endpoint',
        method: 'post',
      },
      remove: {
        url: '/test/endpoint/{instanceId}',
        method: 'delete',
        urlParamsToFields: {
          instanceId: 'obj.id',
        },
      },
    }

    httpClient = {
      post: mockFunction<HTTPWriteClientInterface['post']>(),
      put: mockFunction<HTTPWriteClientInterface['put']>(),
      delete: mockFunction<HTTPWriteClientInterface['delete']>(),
      patch: mockFunction<HTTPWriteClientInterface['patch']>(),
    }
  })

  it('When no endpoint for deploying the element should throw an error', async () => {
    await expect(() => deployChange({
      change: toChange({ before: instance, after: instance }),
      client: httpClient,
      endpointDetails: endpoint,
    })).rejects.toThrow(
      'No endpoint of type modify for test'
    )
  })

  it('deleting an instance should send the instance id to the right URL', async () => {
    httpClient.delete.mockResolvedValue({
      status: 200,
      data: {},
    })
    instance.value.obj = { id: 1 }
    await deployChange({
      change: toChange({ before: instance }),
      client: httpClient,
      endpointDetails: endpoint,
    })

    expect(instance.value.obj.id).toBe(1)
    expect(httpClient.delete).toHaveBeenCalledWith(expect.objectContaining({
      url: '/test/endpoint/1',
    }))
  })

  it('should not send ignored fields', async () => {
    httpClient.post.mockResolvedValue({
      status: 200,
      data: {},
    })
    await deployChange({
      change: toChange({ after: instance }),
      client: httpClient,
      endpointDetails: endpoint,
      fieldsToIgnore: path => path.name === 'ignored',
    })

    expect(httpClient.post).toHaveBeenCalledWith({
      url: '/test/endpoint',
      data: {
        creatableField: 'creatableValue',
      },
    })
  })
  it('should omit request body when deploy request config contains omitRequestBody=true', async () => {
    httpClient.delete.mockResolvedValue({
      status: 200,
      data: {},
    })
    instance.value.id = '1'
    await deployChange({
      change: toChange({ before: instance }),
      client: httpClient,
      endpointDetails: {
        remove: {
          url: '/test/endpoint/{instanceId}',
          method: 'delete',
          urlParamsToFields: {
            instanceId: 'id',
          },
          omitRequestBody: true,
        },
      },
    })
    expect(httpClient.delete).toHaveBeenCalledWith({ url: '/test/endpoint/1', data: undefined, queryParams: undefined })
  })
  it('should include request body when deploy request config contains omitRequestBody=false', async () => {
    httpClient.delete.mockResolvedValue({
      status: 200,
      data: {},
    })
    instance.value.id = '1'
    await deployChange({
      change: toChange({ before: instance }),
      client: httpClient,
      endpointDetails: {
        remove: {
          url: '/test/endpoint/{instanceId}',
          method: 'delete',
          urlParamsToFields: {
            instanceId: 'id',
          },
          omitRequestBody: false,
        },
      },
    })
    expect(httpClient.delete).toHaveBeenCalledWith({
      url: '/test/endpoint/1',
      data: { id: '1', creatableField: 'creatableValue', ignored: 'ignored' },
      queryParams: undefined,
    })
  })
})

describe('filterUndeployableValues', () => {
  let instance: InstanceElement

  beforeEach(() => {
    const type = new ObjectType({
      elemID: new ElemID('adapter', 'test'),
      fields: {
        creatable: {
          refType: BuiltinTypes.STRING,
          annotations: {
            [CORE_ANNOTATIONS.CREATABLE]: true,
            [CORE_ANNOTATIONS.UPDATABLE]: false,
          },
        },

        updatable: {
          refType: BuiltinTypes.STRING,
          annotations: {
            [CORE_ANNOTATIONS.CREATABLE]: false,
            [CORE_ANNOTATIONS.UPDATABLE]: true,
          },
        },
      },
    })


    instance = new InstanceElement(
      'instance',
      type,
      {
        creatable: 'aaa',
        updatable: 'bbb',
        other: 'ccc',
      }
    )
  })

  it('should filter the the unsupported values', async () => {
    const addValues = await filterUndeployableValues(instance, 'add')
    expect(addValues.value).toEqual({
      creatable: 'aaa',
      other: 'ccc',
    })

    const updateValues = await filterUndeployableValues(instance, 'modify')
    expect(updateValues.value).toEqual({
      updatable: 'bbb',
      other: 'ccc',
    })

    const removeValues = await filterUndeployableValues(instance, 'remove')
    expect(removeValues.value).toEqual({
      creatable: 'aaa',
      updatable: 'bbb',
      other: 'ccc',
    })
  })
})
