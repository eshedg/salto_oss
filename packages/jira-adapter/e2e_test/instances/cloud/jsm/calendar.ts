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

import { Values } from '@salto-io/adapter-api'

export const createCalendarValues = (name: string): Values => ({
  name,
  timezoneId: 'Asia/Jerusalem',
  holidays: [
    {
      name: 'Test',
      iso8601Date: '2024-01-03',
      recurring: true,
    },
  ],
  workingTimes: [
    {
      weekday: 'monday',
      start: 32400000,
      end: 61200000,
    },
  ],
})
