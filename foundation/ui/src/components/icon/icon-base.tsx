import ArrowDown from "lucide-react/icons/arrow-down";
import ArrowRight from "lucide-react/icons/arrow-right";
import ArrowUp from "lucide-react/icons/arrow-up";
import ArrowUpDown from "lucide-react/icons/arrow-up-down";
import ArrowUpRight from "lucide-react/icons/arrow-up-right";
import BookUser from "lucide-react/icons/book-user";
import CalendarDays from "lucide-react/icons/calendar-days";
import Check from "lucide-react/icons/check";
import ChevronDown from "lucide-react/icons/chevron-down";
import ChevronLeft from "lucide-react/icons/chevron-left";
import ChevronRight from "lucide-react/icons/chevron-right";
import CircleAlert from "lucide-react/icons/circle-alert";
import CircleCheck from "lucide-react/icons/circle-check";
import CircleX from "lucide-react/icons/circle-x";
import Clock from "lucide-react/icons/clock";
import Compass from "lucide-react/icons/compass";
import Copy from "lucide-react/icons/copy";
import Ellipsis from "lucide-react/icons/ellipsis";
import FileText from "lucide-react/icons/file-text";
import History from "lucide-react/icons/history";
import House from "lucide-react/icons/house";
import Info from "lucide-react/icons/info";
import Layers from "lucide-react/icons/layers";
import ListFilter from "lucide-react/icons/list-filter";
import LoaderCircle from "lucide-react/icons/loader-circle";
import LogOut from "lucide-react/icons/log-out";
import Menu from "lucide-react/icons/menu";
import MessageSquare from "lucide-react/icons/message-square";
import Pencil from "lucide-react/icons/pencil";
import Pin from "lucide-react/icons/pin";
import Plus from "lucide-react/icons/plus";
import RotateCcw from "lucide-react/icons/rotate-ccw";
import Search from "lucide-react/icons/search";
import Settings from "lucide-react/icons/settings";
import Sparkles from "lucide-react/icons/sparkles";
import Square from "lucide-react/icons/square";
import Trash2 from "lucide-react/icons/trash-2";
import TriangleAlert from "lucide-react/icons/triangle-alert";
import Users from "lucide-react/icons/users";
import X from "lucide-react/icons/x";

import styles from "./icon.module.css";

const icons = {
  warning: CircleAlert,
  // Feedback tones: each status keeps its own shape, so tone never rests on color alone.
  success: CircleCheck,
  attention: TriangleAlert,
  failure: CircleX,
  assistant: Sparkles,
  clock: Clock,
  info: Info,
  pin: Pin,
  pinned: Pin,
  settings: Settings,
  add: Plus,
  discard: Trash2,
  menu: Menu,
  sort: ArrowUpDown,
  team: Users,
  contacts: BookUser,
  ascending: ArrowUp,
  descending: ArrowDown,
  guide: Compass,
  more: Ellipsis,
  home: House,
  layers: Layers,
  application: FileText,
  activity: History,
  round: CalendarDays,
  left: ChevronLeft,
  right: ChevronRight,
  down: ChevronDown,
  check: Check,
  arrow: ArrowUpRight,
  forward: ArrowRight,
  edit: Pencil,
  copy: Copy,
  loading: LoaderCircle,
  exit: LogOut,
  reset: RotateCcw,
  close: X,
  send: ArrowUp,
  stop: Square,
  chat: MessageSquare,
  search: Search,
  filter: ListFilter,
} as const;

export type IconName = keyof typeof icons;

/** Every icon name in definition order, for catalog previews. */
export const iconNames: readonly IconName[] = Object.keys(icons).filter(
  (key): key is IconName => key in icons,
);

/**
 * The shared glyph for modules inside this package. className places or animates the glyph within
 * the control that owns it; size, stroke, and color stay shared. Features use Icon.
 */
export const IconBase = ({ name, className }: { name: IconName; className?: string }) => {
  const Glyph = icons[name];

  return (
    <Glyph
      aria-hidden="true"
      size={16}
      strokeWidth={name === "pinned" ? 1.25 : 1.75}
      // Solid glyphs mark a state by shape as well as tone: a pinned item, and the square that stops
      // work in progress. Everything else is drawn in outline.
      fill={name === "pinned" || name === "stop" ? "currentColor" : "none"}
      className={`${styles.icon} ${className ?? ""}`}
    />
  );
};
