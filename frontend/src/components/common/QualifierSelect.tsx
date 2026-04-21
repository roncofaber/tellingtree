import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export const DATE_QUALIFIERS = [
  { value: "exact",      label: "Exact"      },
  { value: "year-only",  label: "Year only"  },
  { value: "about",      label: "circa"      },
  { value: "before",     label: "Before"     },
  { value: "after",      label: "After"      },
  { value: "between",    label: "Between"    },
  { value: "estimated",  label: "Estimated"  },
  { value: "calculated", label: "Calculated" },
];

export function QualifierSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => { if (v !== null) onChange(v); }}>
      <SelectTrigger className="w-28 shrink-0 h-8 text-xs">
        <span className="text-xs">{DATE_QUALIFIERS.find(q => q.value === value)?.label ?? "Exact"}</span>
      </SelectTrigger>
      <SelectContent>
        {DATE_QUALIFIERS.map(q => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
