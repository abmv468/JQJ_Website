import localFont from "next/font/local";

const heading = localFont({
  src: [
    {
      path: "../../assets/fonts/InstrumentSans-Variable.ttf",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-auth-heading",
  display: "swap",
  adjustFontFallback: false,
});

const body = localFont({
  src: [
    {
      path: "../../assets/fonts/Manrope-Variable.ttf",
      weight: "200 800",
      style: "normal",
    },
  ],
  variable: "--font-auth-body",
  display: "swap",
  adjustFontFallback: false,
});

const zh = localFont({
  src: [
    {
      path: "../../assets/fonts/NotoSerifCJKtc-JQ.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-auth-zh",
  display: "swap",
  adjustFontFallback: false,
});

/** Same local files the typeset auth shell already loads. */
export const typesetFontVariables = `${heading.variable} ${body.variable} ${zh.variable}`;
