<script lang="ts">
  import { Calendar as CalendarPrimitive, RangeCalendar as RangeCalendarPrimitive } from 'bits-ui';
  import { parseDate } from '@internationalized/date';
  import { LineChart } from 'layerchart';
  import { scalePoint } from 'd3-scale';
  import { components as Calendar } from '@viewstem/svelte-ui/shadcn/calendar';
  import { components as RangeCalendar } from '@viewstem/svelte-ui/shadcn/range-calendar';
  import { components as Chart } from '@viewstem/svelte-ui/shadcn/chart';

  const locale = 'ko-KR';
  const start = parseDate('2026-11-02');
  let month = $state(start);
  let rangeMonth = $state(start);
  const series = [{ key: 'count', label: '처리량', color: 'var(--chart-1)' }];
  const chartData = [{ month: '1월', count: 34 }, { month: '2월', count: 43 }, { month: '3월', count: 58 }];
  const xScale = scalePoint<string>().padding(0.25);
</script>

<section aria-label="Calendar 공개 파트" data-fixture="Calendar">
  <CalendarPrimitive.Root {locale} bind:placeholder={month} type="single" value={start} class="group/calendar [--cell-size:2rem] [--cell-radius:0.375rem]">
    {#snippet children({ months, weekdays })}
      <Calendar.Months>
        <Calendar.Nav><Calendar.PrevButton /><Calendar.NextButton /></Calendar.Nav>
        {#each months as calendarMonth, monthIndex (calendarMonth.value.toString())}
          <Calendar.Month>
            <Calendar.Header>
              <Calendar.Heading />
              <Calendar.Caption
                captionLayout="label" months={undefined} monthFormat="long" years={undefined}
                yearFormat="numeric" month={calendarMonth.value} {locale} {monthIndex} bind:placeholder={month}
              />
              <Calendar.MonthSelect value={calendarMonth.value.month} />
              <Calendar.YearSelect value={calendarMonth.value.year} />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHead>
                <Calendar.GridRow>
                  {#each weekdays as weekday, index (index)}
                    <Calendar.HeadCell>{weekday}</Calendar.HeadCell>
                  {/each}
                </Calendar.GridRow>
              </Calendar.GridHead>
              <Calendar.GridBody>
                {#each calendarMonth.weeks as week (week[0].toString())}
                  <Calendar.GridRow>
                    {#each week as date (date.toString())}
                      <Calendar.Cell {date} month={calendarMonth.value}><Calendar.Day /></Calendar.Cell>
                    {/each}
                  </Calendar.GridRow>
                {/each}
              </Calendar.GridBody>
            </Calendar.Grid>
          </Calendar.Month>
        {/each}
      </Calendar.Months>
    {/snippet}
  </CalendarPrimitive.Root>
</section>

<section aria-label="RangeCalendar 공개 파트" data-fixture="RangeCalendar">
  <RangeCalendarPrimitive.Root {locale} bind:placeholder={rangeMonth} value={{ start, end: start.add({ days: 4 }) }} class="group/calendar [--cell-size:2rem] [--cell-radius:0.375rem]">
    {#snippet children({ months, weekdays })}
      <RangeCalendar.Months>
        <RangeCalendar.Nav><RangeCalendar.PrevButton /><RangeCalendar.NextButton /></RangeCalendar.Nav>
        {#each months as calendarMonth, monthIndex (calendarMonth.value.toString())}
          <RangeCalendar.Month>
            <RangeCalendar.Header>
              <RangeCalendar.Heading />
              <RangeCalendar.Caption
                captionLayout="label" months={undefined} monthFormat="long" years={undefined}
                yearFormat="numeric" month={calendarMonth.value} {locale} {monthIndex} bind:placeholder={rangeMonth}
              />
              <RangeCalendar.MonthSelect value={calendarMonth.value.month} />
              <RangeCalendar.YearSelect value={calendarMonth.value.year} />
            </RangeCalendar.Header>
            <RangeCalendar.Grid>
              <RangeCalendar.GridHead>
                <RangeCalendar.GridRow>
                  {#each weekdays as weekday, index (index)}
                    <RangeCalendar.HeadCell>{weekday}</RangeCalendar.HeadCell>
                  {/each}
                </RangeCalendar.GridRow>
              </RangeCalendar.GridHead>
              <RangeCalendar.GridBody>
                {#each calendarMonth.weeks as week (week[0].toString())}
                  <RangeCalendar.GridRow>
                    {#each week as date (date.toString())}
                      <RangeCalendar.Cell {date} month={calendarMonth.value}><RangeCalendar.Day /></RangeCalendar.Cell>
                    {/each}
                  </RangeCalendar.GridRow>
                {/each}
              </RangeCalendar.GridBody>
            </RangeCalendar.Grid>
          </RangeCalendar.Month>
        {/each}
      </RangeCalendar.Months>
    {/snippet}
  </RangeCalendarPrimitive.Root>
</section>

<section aria-label="Chart 공개 파트" data-fixture="Chart">
  <Chart.ChartContainer config={{ count: { label: '처리량' } }}>
    <LineChart data={chartData} x="month" {xScale} {series}>
      {#snippet tooltip()}<Chart.ChartTooltip data-raw-tooltip="" />{/snippet}
    </LineChart>
  </Chart.ChartContainer>
</section>
