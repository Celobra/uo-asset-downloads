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
interface AssistantTarget { Active: boolean; Revision: number; Id: number; Type: string; LastSerial: number }
interface AssistantItem {
  Serial: number; Graphic: number; Hue: number; Amount: number; Container: number;
  Layer: number; Name: string; X: number; Y: number; Z: number; OwnedInventory: boolean;
  Accessible: boolean; Movable: boolean; IsContainer: boolean;
}
interface AssistantPlayer {
  Serial: number; Name: string; Backpack: number; X: number; Y: number; Z: number; Map: number;
  Hits: number; HitsMax: number; Mana: number; ManaMax: number; Stamina: number; StaminaMax: number;
  Weight: number; WeightMax: number; Dead: boolean; Mounted: boolean;
}
interface AssistantMobile {
  Serial: number; Name: string; Body: number; Hue: number; X: number; Y: number; Z: number;
  Distance: number; Notoriety: number;
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
  Switches: number[]; Entries: AssistantEntry[]; Truncated: boolean;
}
interface AssistantRenderOptions {
  CustomLight?: boolean; LightLevel?: number; Weather?: boolean; Sound?: boolean; SoundVolume?: number;
  Music?: boolean; MusicVolume?: number; Footsteps?: boolean; HideVegetation?: boolean;
  TreeStumps?: boolean; DeathScreen?: boolean;
}
interface AssistantItemMatch { Graphic: number; Hue?: number | null }
interface AssistantPropertyRule { Name?: string; Minimum?: number | null; Maximum?: number | null; Contains?: string }
interface AssistantLootRules {
  Name?: string; Source?: number; Destination: number; MaximumRange?: number; DelayMilliseconds?: number;
  MaximumRunSeconds?: number; OpenCorpses?: boolean;
  Rules: {Match?: AssistantItemMatch; NameContains?: string; Properties?: AssistantPropertyRule[]; MaximumAmount?: number}[];
}
interface AssistantVendorRules {
  Name?: string; Vendor?: number; MaximumTotal?: number;
  Rules: {Match: AssistantItemMatch; DesiredAmount: number; MaximumUnitPrice?: number;
    KeepAmount?: number; Properties?: AssistantPropertyRule[]}[];
}
interface AssistantPreview { Commands: unknown[]; Message: string; Total: number }
interface AssistantVendor {
  Token: number; Revision: number; Serial: number; Buy: boolean; Truncated: boolean;
  ManualSelection: boolean;
  Offers: {Serial: number; Graphic: number; Hue: number; Amount: number; UnitPrice: number; Name: string}[];
}
interface AssistantSnapshot {
  Schema: number; SessionId: string; WorldEpoch: number; Sequence: number; CapturedUtc: string;
  InGame: boolean; Connected: boolean; Status: string; Player: AssistantPlayer;
  Performance: {DrawFps: number; FrameP95Ms: number; ClientCpuPercent: number};
  Target: AssistantTarget; HeldItem: number; Items: AssistantItem[]; Mobiles: AssistantMobile[];
  Journal: AssistantJournal[]; InventoryTruncated: boolean; MobilesTruncated: boolean;
  ActionsAvailable: {Kind: string; Id: number; Name: string; Group: string}[];
  Actions: {Sequence: number; Time: string; Origin: string; Command: unknown; Result: string}[];
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
    AssistantPolicy: {Known: boolean; DisabledMask: number};
  };
}
interface AssistantApi {
  snapshot(): Promise<AssistantSnapshot>;
  alias(name: string): Promise<number>;
  isFriend(serial: SerialOrAlias): Promise<boolean>;
  count(graphic: number, hue?: number | null, container?: SerialOrAlias): Promise<{Name: string; Amount: number; Complete: boolean; Message: string}>;
  log(text: string): Promise<boolean>;
  sleep(milliseconds: number): Promise<boolean>;
  /** Leases a fresh target; intervening manual or replacement cursors invalidate it. */
  waitForTarget(timeoutMilliseconds: number): Promise<boolean>;
  waitForJournal(text: string, timeoutMilliseconds: number, afterSequence?: number | null): Promise<boolean>;
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
