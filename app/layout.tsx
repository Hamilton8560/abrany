import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { TimerProvider } from "@/components/timer/TimerProvider";
import MiniTimer from "@/components/timer/MiniTimer";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Abrany — First Personal Brain Trainer",
  description:
    "Abrany is a neuro-training platform. Train your mind with precision, adapt in real time, and unlock measurable cognitive performance.",
};

/**
 * Makes DOM removal/insertion tolerant of nodes that a browser translator
 * (Google Translate, the built-in Chrome/Edge/Safari page translation, or an
 * extension) has re-parented out from under React. Without this, translating the
 * page mutates text nodes React is still reconciling, so the next re-render calls
 * removeChild/insertBefore on a node whose parent has changed and React throws
 * `NotFoundError: Failed to execute 'removeChild' on 'Node'` — which, with no
 * error boundary, leaves the app stuck loading. This is the React-team-recommended
 * workaround and it must run before hydration, so it ships as an inline script at
 * the very top of <body>. It only no-ops the two calls when the parent mismatches;
 * normal React operations are untouched.
 */
const TRANSLATE_GUARD = `(function(){if(typeof Node!=='function'||!Node.prototype)return;
var r=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c&&c.parentNode!==this){return c;}return r.apply(this,arguments);};
var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,ref){if(ref&&ref.parentNode!==this){return n;}return i.apply(this,arguments);};})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${inter.variable} antialiased`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: TRANSLATE_GUARD }} />
        <TimerProvider>
          {children}
          <MiniTimer />
        </TimerProvider>
      </body>
    </html>
  );
}
