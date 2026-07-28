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
    <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-2)] p-4">
      <Input
        data-testid="users-search"
        type="text"
        className="w-full"
        placeholder={t("manager:users.searchPlaceholder", { defaultValue: "Nach Benutzername suchen..." })}
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="flex flex-wrap gap-4">
        <FilterGroup label={t("manager:users.roleFilter")}>
          <FilterPill
            active={roleFilter === "all"}
            onClick={() => onRoleFilterChange("all")}
          >
            {t("manager:users.roleAll")}
          </FilterPill>
          <FilterPill
            active={roleFilter === "user"}
            onClick={() => onRoleFilterChange("user")}
          >
            {t("manager:users.role.user")}
          </FilterPill>
          <FilterPill
            active={roleFilter === "lehrkraft"}
            onClick={() => onRoleFilterChange("lehrkraft")}
          >
            {t("manager:users.role.lehrkraft")}
          </FilterPill>
          <FilterPill
            active={roleFilter === "admin"}
            onClick={() => onRoleFilterChange("admin")}
          >
            {t("manager:users.role.admin")}
          </FilterPill>
        </FilterGroup>

        <FilterGroup label={t("manager:users.statusFilter")}>
          <FilterPill
            active={statusFilter === "all"}
            onClick={() => onStatusFilterChange("all")}
          >
            {t("manager:users.statusAll")}
          </FilterPill>
          <FilterPill
            active={statusFilter === "active"}
            onClick={() => onStatusFilterChange("active")}
          >
            {t("manager:users.active")}
          </FilterPill>
          <FilterPill
            active={statusFilter === "inactive"}
            onClick={() => onStatusFilterChange("inactive")}
          >
            {t("manager:users.disabledStatus")}
          </FilterPill>
        </FilterGroup>
      </div>
    </div>
  )
}
