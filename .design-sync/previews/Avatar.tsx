import { Avatar } from "@razzoozle/web"

export const Roster = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Avatar name="Mira Solberg" />
    <Avatar name="Théo" />
    <Avatar name="Anna Kowalski" />
    <Avatar name="Youssef" />
    <Avatar name="Priya Nair" />
  </div>
)

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
    <Avatar name="Mira Solberg" size={24} />
    <Avatar name="Mira Solberg" size={40} />
    <Avatar name="Mira Solberg" size={64} />
    <Avatar name="Mira Solberg" size={96} />
  </div>
)

export const GeneratedIdentities = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Avatar name="Player 1" src="dicebear:bottts:capitals-of-europe-1" size={56} />
    <Avatar name="Player 2" src="dicebear:thumbs:capitals-of-europe-2" size={56} />
    <Avatar name="Player 3" src="dicebear:fun:capitals-of-europe-3" size={56} />
    <Avatar name="Player 4" src="dicebear:people:capitals-of-europe-4" size={56} />
  </div>
)
