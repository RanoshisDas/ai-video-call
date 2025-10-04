import "./globals.css"; // or "../styles/globals.css" depending on your folder
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
    return <Component {...pageProps} />;
}
