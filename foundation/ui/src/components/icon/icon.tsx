import { IconBase, type IconName } from "./icon-base";

/**
 * Use Icon for interface symbols. Its Lucide glyphs share a 16 px size, 1.75 stroke width, normal
 * stroke scaling, and the surrounding text color. The filled pin uses a lighter 1.25 stroke and
 * muted color to keep its saved state quiet. Extend the explicitly imported set as needed. The
 * control or layout around an icon places it, so size and stroke stay consistent across controls.
 *
 * Icons reinforce labels and are hidden from assistive technology. Give icon-only controls an
 * accessible name from the message catalogs and a target larger than the glyph. Express status
 * meaning in text as well.
 */
export const Icon = ({ name }: { name: IconName }) => <IconBase name={name} />;
