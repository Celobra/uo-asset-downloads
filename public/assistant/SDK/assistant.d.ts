/** Editor help for the companion's bounded JavaScript API.
 * Calls return promises. Write `await assistant.useObject(...)`.
 * This file provides types only; scripts cannot import files or load modules.
 * Snapshots are copies of currently loaded facts, with PascalCase property names.
 * A requested action is not a shard acknowledgement. Wait for a relevant change.
 * Some snapshot identities/masks are 64-bit integers and can lose precision in
 * JavaScript. Treat them as informational; reply methods retain exact host leases.
 */
type SerialOrAlias = number | string;
interface AssistantResult { RequestId: string; Accepted: boolean; Message: string; Serial: number }
interface AssistantTarget { Active: boolean; Revision: number; Id: number; Type: string; LastSerial: number; Disposition: string }
interface AssistantItem {
  Serial: number; Graphic: number; Hue: number; Amount: number; Container: number;
  Layer: number; Name: string; X: number; Y: number; Z: number; OwnedInventory: boolean;
  Accessible: boolean; TileName: string; Movable: boolean; IsContainer: boolean;
}
interface AssistantPlayer {
  Serial: number; Name: string; Backpack: number; X: number; Y: number; Z: number; Map: number;
  Hits: number; HitsMax: number; Mana: number; ManaMax: number; Stamina: number; StaminaMax: number;
  Weight: number; WeightMax: number; Dead: boolean; Mounted: boolean; Dexterity: number;
}
interface AssistantMobile {
  Serial: number; Name: string; Body: number; Hue: number; X: number; Y: number; Z: number;
  Distance: number; Notoriety: number; Hits?: number | null; HitsMax?: number | null;
  Renamable?: boolean | null; Poisoned?: boolean | null;
}
interface AssistantJournal { Sequence: number; Time: string; Text: string; Type: string; Name: string }
interface AssistantItemDetail {
  Serial: number; Ground: boolean; Corpse: boolean; Distance: number; PropertyRevision: number;
  PropertyName: string; Properties: string; Clilocs: number[]; WearableLayer: number;
  TwoHanded: boolean; ContentsLoaded: boolean; PropertiesComplete: boolean;
}
interface AssistantBuff { Id: number; Graphic: number; Text: string; RemainingMilliseconds: number }
interface AssistantEntry { Id: number; Text: string; MaximumLength?: number }
interface AssistantDialog {
  Token: number; Revision: number; LocalSerial: number; ServerSerial: number; Kind: string;
  Text: string[]; Choices: {Id: number; Text: string; Graphic: number; Hue: number}[];
  Switches: number[]; Entries: AssistantEntry[]; ActivePage: number;
  /** Local page switches are distinct from server reply buttons. */
  PageChoices: {Id: number; Text: string; Graphic: number; Hue: number}[]; Truncated: boolean;
}
interface AssistantRenderOptions {
  CustomLight?: boolean; LightLevel?: number; Weather?: boolean; Sound?: boolean; SoundVolume?: number;
  Music?: boolean; MusicVolume?: number; Footsteps?: boolean; HideVegetation?: boolean;
  TreeStumps?: boolean; DeathScreen?: boolean;
}
interface AssistantItemMatch { Graphic: number; Hue?: number | null }
interface AssistantPropertyRule { Name?: string; Minimum?: number | null; Maximum?: number | null; Contains?: string }
/** Numeric enum values: 0=All, 1=Any. */
type AssistantPredicateJoin = 0 | 1;
interface AssistantPredicateGroup { Join?: AssistantPredicateJoin; Properties: AssistantPropertyRule[] }
interface AssistantLootRules {
  Name?: string; Source?: number; Destination: number; MaximumRange?: number; DelayMilliseconds?: number;
  MaximumRunSeconds?: number; OpenCorpses?: boolean;
  Rules: {Match?: AssistantItemMatch; NameContains?: string; Properties?: AssistantPropertyRule[]; MaximumAmount?: number;
    Priority?: number; GroupJoin?: AssistantPredicateJoin; Groups?: AssistantPredicateGroup[];
    Name?: string; Destination?: number}[];
}
interface AssistantVendorRules {
  Name?: string; Vendor?: number; MaximumTotal?: number;
  Rules: {Match: AssistantItemMatch; DesiredAmount: number; MaximumUnitPrice?: number;
    KeepAmount?: number; Properties?: AssistantPropertyRule[]; Priority?: number;
    GroupJoin?: AssistantPredicateJoin; Groups?: AssistantPredicateGroup[]}[];
}
interface AssistantPreview { Commands: unknown[]; Message: string; Total: number }
interface AssistantVendor {
  Token: number; Revision: number; Serial: number; Buy: boolean; Truncated: boolean;
  ManualSelection: boolean;
  Offers: {Serial: number; Graphic: number; Hue: number; Amount: number; UnitPrice: number; Name: string}[];
}
interface AssistantFrameSample {
  Sequence: number; IntervalMs: number; NetworkMs: number; WorldUpdateMs: number;
  UiUpdateMs: number; AssistantMs: number; WorldDrawMs: number; UiDrawMs: number; PresentMs: number;
}
interface AssistantNativeTools {
  ProcessId: number; Frames: AssistantFrameSample[]; LatencyMilliseconds?: number | null;
  HotkeysEnabled: boolean; PassThrough: boolean; Feedback: string; FeedbackSequence: number;
  RoutePreview: {X: number; Y: number; Z?: number | null; Loaded: boolean; Impassable: boolean}[];
  RouteStatus: string;
  Layout: {Width: number; Height: number;
    Gumps: {Type: string; LocalSerial: number; ServerSerial: number; X: number; Y: number}[]};
}
interface AssistantInputBinding {
  Gesture: string; Kind: string; Id: number; Serial: number; Name: string; PassThrough: boolean;
  Context: "Game" | "Targeting" | "Chat"; Trigger: "Tap" | "Release" | "Hold";
}
interface AssistantTargetPreset {
  Id: number; Name: string; Category: "Hostile" | "Friendly" | "Any"; Range: number;
  Selection: "Nearest" | "Next" | "Previous" | "LowestHealth"; ExcludeFriends: boolean;
  ExcludeRenamable: boolean; PoisonedOnly: boolean; Body: number; RequireKnownHealth: boolean;
}
interface AssistantActionSlot {
  Id: number; Label: string; Kind: string; ActionId: number; Serial: number; Name: string; Hotkey: string;
  RemainingMilliseconds: number; Estimated: boolean; Running: boolean; CooldownName: string; StateLabel: string;
}
interface AssistantPlayability {
  /** Entries exist only after actual server skill observations. Cap can remain unknown. */
  Skills: {Id: number; Name: string; Value: number; Base: number; Cap: number | null}[];
  Bindings: AssistantInputBinding[]; TargetPresets: AssistantTargetPreset[]; ActionSlots: AssistantActionSlot[];
  ShowActionBar: boolean; TraceLogging: boolean; MutedSoundIds: number[];
  RecentSounds: {Id: number; HeardUtc: string; Muted: boolean}[]; GridLootMode: number;
  LastFriendly: number; LastEnemy: number; FrameP99Milliseconds: number; LongFrames: number;
  DiagnosticsFile: string; DroppedLogMessages: number; Feedback: string;
}
interface AssistantSnapshot {
  Schema: number; SessionId: string; WorldEpoch: number; Sequence: number; CapturedUtc: string;
  InGame: boolean; Connected: boolean; Status: string; Player: AssistantPlayer;
  Performance: {DrawFps: number; FrameP95Ms: number; ClientCpuPercent: number; FrameP99Ms: number; LongFrames: number};
  Target: AssistantTarget; HeldItem: number; Items: AssistantItem[]; Mobiles: AssistantMobile[];
  Journal: AssistantJournal[]; InventoryTruncated: boolean; MobilesTruncated: boolean;
  ActionsAvailable: {Kind: string; Id: number; Name: string; Group: string}[];
  Actions: {Sequence: number; Time: string; Origin: string; Command: unknown; Result: string;
    ItemGraphic?: number | null; ItemHue?: number | null; OwnedInventory?: boolean}[];
  Capabilities: string[];
  Features: {
    ItemDetails: AssistantItemDetail[]; ItemDetailsTruncated: boolean;
    Buffs: AssistantBuff[]; Dialogs: AssistantDialog[]; Vendors: AssistantVendor[];
    Prompt: {Active: boolean; Revision: number; Id: number; Type: string};
    Movement: {Searching: boolean; Walking: boolean; Blocked: boolean; DestinationX: number;
      DestinationY: number; DestinationZ: number; Status: string};
    Combat: {WarMode: boolean; Flying: boolean; CanFly: boolean; Poisoned: boolean; LastAttack: number;
      PrimaryAbility: number; SecondaryAbility: number};
    Rendering: Required<AssistantRenderOptions>; Truncated: boolean; PartyMembers: number[];
    LockedFeatures: number; CharacterFeatures: number;
    AssistantPolicy: {Known: boolean; DisabledMask: number}; NativeTools: AssistantNativeTools;
    Playability: AssistantPlayability;
  };
}
interface AssistantSearchFilter {
  /** Case-insensitive name/text match. Empty matches any known or unknown name. */
  Name?: string; ExactName?: boolean; Graphic?: number; Hue?: number;
}
interface AssistantTileQuery extends AssistantSearchFilter {
  Kind?: "Any" | "Tree" | "Cave" | "Land" | "Static";
  Map?: number; X?: number; Y?: number; Radius?: number; Offset?: number;
}
interface AssistantTile {
  X: number; Y: number; Z: number; Graphic: number; DisplayGraphic: number; Hue: number;
  Name: string; Kind: "Land" | "Static"; Tree: boolean; Cave: boolean; Distance: number;
}
interface AssistantTilePage {
  Map: number; X: number; Y: number; Radius: number; CapturedUtc: string;
  Tiles: AssistantTile[]; NextOffset: number | null; UnloadedTiles: number; Truncated: boolean; Complete: boolean;
}
interface AssistantItemQuery extends AssistantSearchFilter {
  Scope?: "Any" | "Ground" | "Owned" | "Equipped" | "Backpack";
  Container?: number; Recursive?: boolean; Range?: number;
  Movable?: boolean; IsContainer?: boolean; Limit?: number;
}
interface AssistantGumpQuery extends AssistantSearchFilter {
  Type?: string; LocalSerial?: number; ServerSerial?: number; Offset?: number;
}
interface AssistantScannedControl {
  Type: string; Serial: number; X: number; Y: number; Width: number; Height: number;
  Page: number; Enabled: boolean; Text: string; Graphic: number | null; Hue: number | null;
  Button: number | null; Action: string; ToPage: number | null;
}
interface AssistantScannedGump {
  Token: number; Type: string; LocalSerial: number; ServerSerial: number;
  X: number; Y: number; Width: number; Height: number; ActivePage: number; FromServer: boolean;
  Controls: AssistantScannedControl[]; Truncated: boolean;
}
interface AssistantApi {
  /** Loaded terrain only, radius 0–18, at most 32 cells/256 matches per page.
   * Keep Map/X/Y/Radius fixed and use NextOffset until null. Aggregate missing/truncated flags.
   * Graphic is original map art; DisplayGraphic may differ with the season.
   * Tree uses the client's tree filter; Cave uses its cave filter or a land name containing cave.
   * Classification is a candidate, never proof that the shard allows harvesting. */
  scanTiles(query?: AssistantTileQuery): Promise<AssistantTilePage>;
  /** Loaded items only; never opens containers or requests names/properties.
   * Best known property/item/tile name, case insensitive. Range filters Ground scope.
   * Complete refers to captured facts, never the entire shard or unseen inventories. */
  findItems(query?: AssistantItemQuery): Promise<{Items: AssistantItem[]; Complete: boolean; UnknownNames: number; Message: string}>;
  /** Open visible game windows, nested visible controls on the active page.
   * Excludes editable fields. Bounded pages, follow NextOffset; a truncated gump remains partial.
   * Name matches type or control text. Does not lease, click, reply, or open a window. */
  findGumps(query?: AssistantGumpQuery): Promise<{Gumps: AssistantScannedGump[]; NextOffset: number | null; Truncated: boolean; Complete: boolean}>;
  snapshot(): Promise<AssistantSnapshot>;
  alias(name: string): Promise<number>;
  isFriend(serial: SerialOrAlias): Promise<boolean>;
  count(graphic: number, hue?: number | null, container?: SerialOrAlias): Promise<{Name: string; Amount: number; Complete: boolean; Message: string}>;
  log(text: string): Promise<boolean>;
  sleep(milliseconds: number): Promise<boolean>;
  /** Leases a fresh target; intervening manual or replacement cursors invalidate it. */
  waitForTarget(timeoutMilliseconds: number): Promise<boolean>;
  waitForJournal(text: string, timeoutMilliseconds: number, afterSequence?: number | null, source?: "All" | "System"): Promise<boolean>;
  openBackpack(): Promise<AssistantResult>;
  openMap(): Promise<AssistantResult>;
  dismount(): Promise<AssistantResult>;
  useObject(serial: SerialOrAlias): Promise<AssistantResult>;
  useType(graphic: number, hue?: number | null): Promise<AssistantResult>;
  castSpell(id: number): Promise<AssistantResult>;
  useSkill(id: number): Promise<AssistantResult>;
  targetSelf(): Promise<AssistantResult>;
  targetLast(): Promise<AssistantResult>;
  target(serial: SerialOrAlias): Promise<AssistantResult>;
  cancelTarget(): Promise<AssistantResult>;
  targetGround(x: number, y: number, z: number, graphic?: number): Promise<AssistantResult>;
  moveItem(serial: SerialOrAlias, destination: SerialOrAlias, amount: number): Promise<AssistantResult>;
  /** Equip one loaded item on an unoccupied wearable layer; validates inventory and awaits the observed change. */
  equipItem(serial: SerialOrAlias, layer: number): Promise<boolean>;
  properties(serial: SerialOrAlias): Promise<AssistantItemDetail | false>;
  buffs(): Promise<AssistantBuff[]>;
  /** Finds a matching currently open/newly arrived dialog; leases its exact identity for one reply. */
  waitForGump(serverSerial?: number, timeoutMilliseconds?: number): Promise<AssistantDialog | false>;
  waitForMenu(text?: string, timeoutMilliseconds?: number): Promise<AssistantDialog | false>;
  waitForTextEntry(timeoutMilliseconds?: number): Promise<AssistantDialog | false>;
  waitForPrompt(timeoutMilliseconds?: number): Promise<{Active: boolean; Revision: number; Id: number; Type: string} | false>;
  replyGump(button: number, switches?: number[], entries?: AssistantEntry[]): Promise<AssistantResult>;
  replyMenu(choice: number): Promise<AssistantResult>;
  replyTextEntry(text: string, cancel?: boolean): Promise<AssistantResult>;
  replyPrompt(text: string, cancel?: boolean): Promise<AssistantResult>;
  vendorBuy(rules: AssistantVendorRules): Promise<AssistantPreview>;
  vendorSell(rules: AssistantVendorRules): Promise<AssistantPreview>;
  loot(rules: AssistantLootRules): Promise<{Requested: number}>;
  scavenge(rules: AssistantLootRules): Promise<{Requested: number}>;
  /** Native pathfinding over loaded nearby terrain; timeout stops this run's movement. */
  walkTo(x: number, y: number, z: number, stoppingRange?: number, run?: boolean, timeoutMilliseconds?: number): Promise<boolean>;
  stopWalking(): Promise<AssistantResult>;
  attack(serial: SerialOrAlias): Promise<AssistantResult>;
  warMode(enabled: boolean): Promise<AssistantResult>;
  primaryAbility(): Promise<AssistantResult>;
  secondaryAbility(): Promise<AssistantResult>;
  toggleFlight(): Promise<AssistantResult>;
  /** Supplies a complete options value: omitted fields use the documented defaults. */
  setRenderOptions(options: AssistantRenderOptions): Promise<AssistantResult>;
  mapWaypoint(x: number, y: number, name: string): Promise<AssistantResult>;
}
declare const assistant: Readonly<AssistantApi>;
