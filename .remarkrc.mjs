import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkValidateLinks from "remark-validate-links";

const mdx = remark().use(remarkGfm).use(remarkMdx);

// Apply MDX syntax only to .mdx files so Markdown prose can contain literal braces.
/** @type {import("unified").Plugin<[], ReturnType<typeof mdx.parse>>} */
const parseMdx = () => (tree, file) => (file.extname === ".mdx" ? mdx.parse(file) : tree);

export default {
  plugins: [remarkGfm, parseMdx, [remarkValidateLinks, { repository: false }]],
};
