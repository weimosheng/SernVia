import * as React from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn("rdp-root", defaultClassNames.root),
        months: cn("rdp-months", defaultClassNames.months),
        month: cn("rdp-month", defaultClassNames.month),
        month_caption: cn("rdp-month_caption", defaultClassNames.month_caption, "relative flex items-center justify-center py-1"),
        caption_label: cn("rdp-caption_label", defaultClassNames.caption_label, "text-sm font-medium"),
        month_grid: cn("rdp-month_grid", defaultClassNames.month_grid, "w-full border-collapse mt-2"),
        weekdays: cn("rdp-weekdays", defaultClassNames.weekdays),
        weekday: cn("rdp-weekday", defaultClassNames.weekday, "text-muted-foreground text-xs font-normal py-1"),
        week: cn("rdp-week", defaultClassNames.week),
        day: cn("rdp-day", defaultClassNames.day, "p-0"),
        day_button: cn(
          "rdp-day_button",
          defaultClassNames.day_button,
          "h-9 w-9 text-sm font-normal rounded-md",
          "aria-selected:opacity-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "hover:bg-accent hover:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50"
        ),
        selected: cn(
          "rdp-selected",
          defaultClassNames.selected,
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
        ),
        today: cn("rdp-today", defaultClassNames.today, "bg-accent text-accent-foreground"),
        outside: cn("rdp-outside", defaultClassNames.outside, "text-muted-foreground/50 opacity-50"),
        disabled: cn("rdp-disabled", defaultClassNames.disabled, "text-muted-foreground/50"),
        range_middle: cn(
          "rdp-range_middle",
          defaultClassNames.range_middle,
          "bg-accent text-accent-foreground rounded-none"
        ),
        range_start: cn("rdp-range_start", defaultClassNames.range_start, "rounded-l-md"),
        range_end: cn("rdp-range_end", defaultClassNames.range_end, "rounded-r-md"),
        nav: cn("rdp-nav", defaultClassNames.nav, "flex items-center justify-between"),
        button_next: cn(
          "rdp-button_next",
          defaultClassNames.button_next,
          "rdp-button_next ml-auto h-7 w-7 bg-transparent p-0"
        ),
        button_previous: cn(
          "rdp-button_previous",
          defaultClassNames.button_previous,
          "rdp-button_previous mr-auto h-7 w-7 bg-transparent p-0"
        ),
        chevron: cn("rdp-chevron", defaultClassNames.chevron),
        dropdowns: cn("rdp-dropdowns", defaultClassNames.dropdowns, "flex gap-1 items-center"),
        years_dropdown: cn("rdp-years_dropdown", defaultClassNames.years_dropdown),
        months_dropdown: cn("rdp-months_dropdown", defaultClassNames.months_dropdown),
        ...classNames,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
