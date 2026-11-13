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
import Compass from "lucide-react/icons/compass";
import Copy from "lucide-react/icons/copy";
import Ellipsis from "lucide-react/icons/ellipsis";
import FileText from "lucide-react/icons/file-text";
import History from "lucide-react/icons/history";
import House from "lucide-react/icons/house";
import Layers from "lucide-react/icons/layers";
import LoaderCircle from "lucide-react/icons/loader-circle";
import LogOut from "lucide-react/icons/log-out";
import Menu from "lucide-react/icons/menu";
import Pencil from "lucide-react/icons/pencil";
import Pin from "lucide-react/icons/pin";
import Plus from "lucide-react/icons/plus";
import RotateCcw from "lucide-react/icons/rotate-ccw";
import Settings from "lucide-react/icons/settings";
import Trash2 from "lucide-react/icons/trash-2";
import Users from "lucide-react/icons/users";
import X from "lucide-react/icons/x";

import styles from "./icon.module.css";

const icons = {
  pin: Pin,
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
} as const;

export const Icon = ({ name, className }: { name: keyof typeof icons; className?: string }) => {
  const Glyph = icons[name];

  return (
    <Glyph
      aria-hidden="true"
      size={16}
      strokeWidth={1.75}
      className={`${styles.icon} ${className ?? ""}`}
    />
  );
};
