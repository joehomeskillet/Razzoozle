import Input from "@razzoozle/web/components/Input"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import FilterGroup from "@razzoozle/web/components/manager/FilterGroup"
import { useTranslation } from "react-i18next"

interface UserFilterPanelProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  roleFilter: "all" | "user" | "lehrkraft" | "admin"
  onRoleFilterChange: (value: "all" | "user" | "lehrkraft" | "admin") => void
  statusFilter: "all" | "active" | "inactive"
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void
}

export default function UserFilterPanel({
  searchTerm,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
}: UserFilterPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full sm:max-w-xs">
        <Input
          type="search"
          placeholder={t("manager:users.searchPlaceholder", { defaultValue: "Benutzer suchen..." })}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterGroup label={t("manager:users.filterRole", { defaultValue: "Rolle" })}>
          <FilterPill
            active={roleFilter === "all"}
            onClick={() => onRoleFilterChange("all")}
          >
            {t("manager:users.filterAll", { defaultValue: "Alle" })}
          </FilterPill>
          <FilterPill
            active={roleFilter === "user"}
            onClick={() => onRoleFilterChange("user")}
          >
            {t("manager:users.role.user", { defaultValue: "Schüler/in" })}
          </FilterPill>
          <FilterPill
            active={roleFilter === "lehrkraft"}
            onClick={() => onRoleFilterChange("lehrkraft")}
          >
            {t("manager:users.role.lehrkraft", { defaultValue: "Lehrkraft" })}
          </FilterPill>
          <FilterPill
            active={roleFilter === "admin"}
            onClick={() => onRoleFilterChange("admin")}
          >
            {t("manager:users.role.admin", { defaultValue: "Admin" })}
          </FilterPill>
        </FilterGroup>

        <FilterGroup label={t("manager:users.filterStatus", { defaultValue: "Status" })}>
          <FilterPill
            active={statusFilter === "all"}
            onClick={() => onStatusFilterChange("all")}
          >
            {t("manager:users.filterAll", { defaultValue: "Alle" })}
          </FilterPill>
          <FilterPill
            active={statusFilter === "active"}
            onClick={() => onStatusFilterChange("active")}
          >
            {t("manager:users.active", { defaultValue: "Aktiv" })}
          </FilterPill>
          <FilterPill
            active={statusFilter === "inactive"}
            onClick={() => onStatusFilterChange("inactive")}
          >
            {t("manager:users.inactive", { defaultValue: "Inaktiv" })}
          </FilterPill>
        </FilterGroup>
      </div>
    </div>
  )
}
