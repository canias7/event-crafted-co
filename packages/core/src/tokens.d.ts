// Types for tokens.js. Hand-written so the values stay literal types —
// app code gets autocomplete on the exact hex strings.

export declare const surface: {
  readonly page: "#f4f1ea";
  readonly card: "#fbf9f4";
  readonly muted: "#ece7db";
  readonly border: "#e6e1d5";
  readonly pageDark: "#0d0f13";
  readonly cardDark: "#16181d";
  readonly sheetDark: "#13161c";
  readonly borderDark: "rgba(255,255,255,0.16)";
};

export declare const ink: {
  readonly DEFAULT: "#14161a";
  readonly dim: "#5e636e";
  readonly onDark: "#f4efe6";
  readonly dimOnDark: "#b8ab98";
};

export declare const gold: {
  readonly DEFAULT: "#c9a86a";
  readonly ink: "#8a6f3e";
  readonly onDark: "#d9bd82";
  readonly tint: "#eadfc6";
  readonly inkOnGold: "#14161a";
};

export declare const type: {
  readonly serifMinSize: 18;
  readonly size: {
    readonly display: 38;
    readonly title: 26;
    readonly heading: 23;
    readonly subheading: 20;
    readonly cardTitle: 18;
    readonly body: 15;
    readonly label: 13;
    readonly caption: 11;
  };
};

export declare const semantic: {
  readonly destructive: "#dc2828";
  readonly success: "#2e7d4f";
  readonly warning: "#d97706";
};

export declare const tailwindColors: Record<string, string>;
