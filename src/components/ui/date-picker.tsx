import { format, startOfWeek, endOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DatePickerRange = "day" | "week" | "month" | "year";

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  range?: DatePickerRange;
  className?: string;
}

const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function formatDateLabel(value: Date, range: DatePickerRange): string {
  switch (range) {
    case "day":
      return format(value, "yyyy-MM-dd", { locale: zhCN });
    case "week": {
      const mon = startOfWeek(value, { weekStartsOn: 1 });
      const sun = endOfWeek(value, { weekStartsOn: 1 });
      if (mon.getMonth() === sun.getMonth()) {
        return `${format(mon, "M月d日", { locale: zhCN })} ~ ${format(sun, "d日", { locale: zhCN })}`;
      }
      return `${format(mon, "M月d日", { locale: zhCN })} ~ ${format(sun, "M月d日", { locale: zhCN })}`;
    }
    case "month":
      return format(value, "yyyy年M月", { locale: zhCN });
    case "year":
      return format(value, "yyyy年", { locale: zhCN });
  }
}

function MonthPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const years = Array.from({ length: 11 }, (_, i) => 2020 + i);

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(new Date(Number(e.target.value), month, 1));
  };
  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(new Date(year, Number(e.target.value), 1));
  };

  return (
    <div className="flex gap-2 p-4">
      <select
        value={year}
        onChange={handleYearChange}
        className="flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}年</option>
        ))}
      </select>
      <select
        value={month}
        onChange={handleMonthChange}
        className="flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      >
        {MONTHS.map((m, i) => (
          <option key={i} value={i}>{m}</option>
        ))}
      </select>
    </div>
  );
}

function YearPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const year = value.getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => 2020 + i);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(new Date(Number(e.target.value), 0, 1));
  };

  return (
    <div className="p-4">
      <select
        value={year}
        onChange={handleChange}
        className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}年</option>
        ))}
      </select>
    </div>
  );
}

export function DatePicker({ value, onChange, range = "day", className = "" }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 h-auto text-sm font-medium",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          <span>{formatDateLabel(value, range)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        {range === "month" ? (
          <MonthPicker value={value} onChange={onChange} />
        ) : range === "year" ? (
          <YearPicker value={value} onChange={onChange} />
        ) : (
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => date && onChange(date)}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0, 1)}
            endMonth={new Date(2030, 11, 31)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
