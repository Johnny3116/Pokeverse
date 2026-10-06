import emeraldA from "@/assets/emerald-imperium-cover.webp.asset.json";
import rubyA from "@/assets/ruby-cover.webp.asset.json";
import sapphireA from "@/assets/sapphire-cover.jpg.asset.json";
import fireredA from "@/assets/firered-cover.webp.asset.json";
import leafgreenA from "@/assets/leafgreen-cover.png.asset.json";
import radicalA from "@/assets/radicalred-cover.jpg.asset.json";

export type Save = { id: string; name: string; location: string; playtime: string; lastPlayed: string };
export type Game = {
  id: string;
  title: string;
  region: string;
  art: string;
  playtime: string;
  badges: number;
  dex: number;
  lastPlayed: string;
  saves: Save[];
  /** Walkthrough page shown in the Guide tab (must allow embedding). */
  guideUrl?: string;
};

export const NUZLOCKE_TRACKER_URL = "https://nuzlocketracker.org/game";

// Demo data — replace with /api/games once the backend is wired up.
export const games: Game[] = [
  {
    id: "emerald-imperium", title: "Emerald Imperium", region: "Hoenn", art: emeraldA.url, playtime: "04:12:38", badges: 3, dex: 142, lastPlayed: "today",
    guideUrl: "https://pokemonemeraldimperium.com/walkthrough/",
    saves: [
      { id: "slot-3", name: "Main run", location: "Route 111 · Desert Passage", playtime: "04:12:38", lastPlayed: "today" },
      { id: "slot-1", name: "Nuzlocke", location: "Petalburg City", playtime: "01:02:10", lastPlayed: "last week" },
    ],
  },
  { id: "radical-red", title: "Radical Red", region: "Kanto", art: radicalA.url, playtime: "05:20:00", badges: 4, dex: 120, lastPlayed: "yesterday",
    saves: [{ id: "slot-1", name: "Main run", location: "Celadon City", playtime: "05:20:00", lastPlayed: "yesterday" }] },
  { id: "ruby", title: "Ruby", region: "Hoenn", art: rubyA.url, playtime: "02:48:00", badges: 5, dex: 97, lastPlayed: "3 days ago",
    saves: [{ id: "slot-1", name: "Main run", location: "Lavaridge Town", playtime: "02:48:00", lastPlayed: "3 days ago" }] },
  { id: "sapphire", title: "Sapphire", region: "Hoenn", art: sapphireA.url, playtime: "01:15:00", badges: 2, dex: 41, lastPlayed: "last week",
    saves: [{ id: "slot-1", name: "Main run", location: "Dewford Town", playtime: "01:15:00", lastPlayed: "last week" }] },
  { id: "firered", title: "FireRed", region: "Kanto", art: fireredA.url, playtime: "06:02:00", badges: 6, dex: 188, lastPlayed: "2 weeks ago",
    saves: [{ id: "slot-1", name: "Main run", location: "Cinnabar Island", playtime: "06:02:00", lastPlayed: "2 weeks ago" }] },
  { id: "leafgreen", title: "LeafGreen", region: "Kanto", art: leafgreenA.url, playtime: "03:30:00", badges: 4, dex: 76, lastPlayed: "last month",
    saves: [{ id: "slot-1", name: "Main run", location: "Celadon City", playtime: "03:30:00", lastPlayed: "last month" }] },
];

export const DEX_TOTAL = 386;
export const getGame = (id: string) => games.find((g) => g.id === id);
