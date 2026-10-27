import { SelectField } from "@/components/tree/fields";
import type { ParentChildType } from "@/lib/genealogy/types";

export const PARENT_TYPE_LABEL: Record<ParentChildType, string> = {
  BIOLOGICAL: "biologiczne",
  ADOPTIVE: "adopcja",
  FOSTER: "rodzina zastępcza",
  STEP: "przybrane (pasierb / pasierbica)",
  UNKNOWN: "nieznane",
};

export function ParentTypeSelect({
  name,
  defaultValue = "BIOLOGICAL",
  label = "Pokrewieństwo",
}: {
  name: string;
  defaultValue?: ParentChildType;
  label?: string;
}) {
  return (
    <SelectField
      name={name}
      label={label}
      defaultValue={defaultValue}
      options={Object.entries(PARENT_TYPE_LABEL) as [string, string][]}
    />
  );
}
