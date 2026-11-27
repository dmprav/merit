import { expect, expectTypeOf, it } from "vite-plus/test";

import type { EscapeHatches } from "@merit/test-support/ui/public-contract";
import * as actionMenu from "@merit/ui/action-menu";
import * as actionProvenance from "@merit/ui/action-provenance";
import * as applicationNavigation from "@merit/ui/application-navigation";
import * as applicationShell from "@merit/ui/application-shell";
import * as attribution from "@merit/ui/attribution";
import * as avatar from "@merit/ui/avatar";
import * as badge from "@merit/ui/badge";
import * as brand from "@merit/ui/brand";
import * as breadcrumbs from "@merit/ui/breadcrumbs";
import * as button from "@merit/ui/button";
import * as calendar from "@merit/ui/calendar";
import * as choiceList from "@merit/ui/choice-list";
import * as collectionToolbar from "@merit/ui/collection-toolbar";
import * as confirmationDialog from "@merit/ui/confirmation-dialog";
import * as conversation from "@merit/ui/conversation";
import * as count from "@merit/ui/count";
import * as dateChoice from "@merit/ui/date-choice";
import * as dateField from "@merit/ui/date-field";
import * as descriptionList from "@merit/ui/description-list";
import * as dialog from "@merit/ui/dialog";
import * as disclosure from "@merit/ui/disclosure";
import * as divider from "@merit/ui/divider";
import * as editorLoading from "@merit/ui/editor-loading";
import * as icon from "@merit/ui/icon";
import * as inlineName from "@merit/ui/inline-name";
import * as judgment from "@merit/ui/judgment";
import * as layout from "@merit/ui/layout";
import * as link from "@merit/ui/link";
import * as messageBox from "@merit/ui/message-box";
import * as metaItem from "@merit/ui/meta-item";
import * as moneyField from "@merit/ui/money-field";
import * as notice from "@merit/ui/notice";
import * as outcomeSummary from "@merit/ui/outcome-summary";
import * as pageHeader from "@merit/ui/page-header";
import * as pagedContent from "@merit/ui/paged-content";
import * as panel from "@merit/ui/panel";
import * as panelSection from "@merit/ui/panel-section";
import * as personIdentity from "@merit/ui/person-identity";
import * as propertiesLayout from "@merit/ui/properties-layout";
import * as propertyButton from "@merit/ui/property-button";
import * as referenceWorkspace from "@merit/ui/reference-workspace";
import * as searchField from "@merit/ui/search-field";
import * as searchPalette from "@merit/ui/search-palette";
import * as sectionHeader from "@merit/ui/section-header";
import * as select from "@merit/ui/select";
import * as sortButton from "@merit/ui/sort-button";
import * as stateMessage from "@merit/ui/state-message";
import * as statusIndicator from "@merit/ui/status-indicator";
import * as statusMessage from "@merit/ui/status-message";
import * as tabs from "@merit/ui/tabs";
import * as text from "@merit/ui/text";
import * as textField from "@merit/ui/text-field";
import * as timeline from "@merit/ui/timeline";
import * as timestamp from "@merit/ui/timestamp";
import * as toast from "@merit/ui/toast";
import * as toggletip from "@merit/ui/toggletip";
import * as tooltip from "@merit/ui/tooltip";
import * as visuallyHidden from "@merit/ui/visually-hidden";

import manifest from "../package.json";
import { iconNames, type IconName } from "./components/icon/icon-base";

/** Every public module, keyed by its package export. */
const publicModules = {
  "./action-menu": actionMenu,
  "./action-provenance": actionProvenance,
  "./application-navigation": applicationNavigation,
  "./application-shell": applicationShell,
  "./avatar": avatar,
  "./badge": badge,
  "./brand": brand,
  "./breadcrumbs": breadcrumbs,
  "./button": button,
  "./calendar": calendar,
  "./choice-list": choiceList,
  "./collection-toolbar": collectionToolbar,
  "./confirmation-dialog": confirmationDialog,
  "./conversation": conversation,
  "./count": count,
  "./date-choice": dateChoice,
  "./date-field": dateField,
  "./description-list": descriptionList,
  "./dialog": dialog,
  "./disclosure": disclosure,
  "./editor-loading": editorLoading,
  "./icon": icon,
  "./inline-name": inlineName,
  "./judgment": judgment,
  "./layout": layout,
  "./link": link,
  "./message-box": messageBox,
  "./meta-item": metaItem,
  "./money-field": moneyField,
  "./notice": notice,
  "./outcome-summary": outcomeSummary,
  "./page-header": pageHeader,
  "./paged-content": pagedContent,
  "./person-identity": personIdentity,
  "./property-button": propertyButton,
  "./reference-workspace": referenceWorkspace,
  "./search-field": searchField,
  "./search-palette": searchPalette,
  "./panel-section": panelSection,
  "./section-header": sectionHeader,
  "./select": select,
  "./sort-button": sortButton,
  "./state-message": stateMessage,
  "./status-indicator": statusIndicator,
  "./status-message": statusMessage,
  "./tabs": tabs,
  "./text": text,
  "./text-field": textField,
  "./timestamp": timestamp,
  "./toast": toast,
  "./toggletip": toggletip,
  "./tooltip": tooltip,
  "./visually-hidden": visuallyHidden,
  "./attribution": attribution,
  "./properties-layout": propertiesLayout,
  "./timeline": timeline,
  "./panel": panel,
  "./divider": divider,
};

/** The events a router adapter uses to navigate and preload through a shared link. */
type RouterLinkEvents = "onClick" | "onMouseEnter" | "onMouseLeave" | "onTouchStart";

type Offenders = {
  [Path in keyof typeof publicModules]: EscapeHatches<
    (typeof publicModules)[Path],
    Path extends "./link" ? RouterLinkEvents : never
  >;
}[keyof typeof publicModules];

it("keeps presentation and interaction with the shared components", () => {
  expectTypeOf<Offenders>().toEqualTypeOf<never>();
});

it("keeps rule colour and weight to the two strengths", () => {
  expectTypeOf<Parameters<typeof divider.Divider>[0]>().not.toHaveProperty("tone");
  expectTypeOf<Parameters<typeof divider.Divider>[0]["strength"]>().toEqualTypeOf<
    "subtle" | "edge" | undefined
  >();
});

it("keeps Badge to a status label", () => {
  expectTypeOf<Parameters<typeof badge.Badge>[0]["children"]>().toEqualTypeOf<string>();
});

it("names icons for what they draw, never for a Merit concept", () => {
  type Domain = Extract<IconName, "round" | "application" | "team" | "contacts">;

  expectTypeOf<Domain>().toEqualTypeOf<never>();
  expect(iconNames).not.toEqual(expect.arrayContaining(["round"]));
  expect(iconNames.filter((name) => ["application", "team", "contacts"].includes(name))).toEqual(
    [],
  );
});

it("checks every public module", () => {
  const modules = Object.entries(manifest.exports)
    .filter(([, path]) => path.endsWith(".tsx"))
    .map(([name]) => name);

  expect(Object.keys(publicModules).toSorted()).toEqual(modules.toSorted());
});
