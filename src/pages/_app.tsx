import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import { Gantari } from 'next/font/google';
import Router from 'next/router';
import NProgress from 'nprogress';
import '../styles/nprogress.css';

Router.events.on('routeChangeStart', () => NProgress.start());
Router.events.on('routeChangeComplete', () => NProgress.done());
Router.events.on('routeChangeError', () => NProgress.done());

const font = Gantari({ subsets: ['latin'] });

function MyApp({ Component, pageProps }: AppProps) {
	return (
		<>
			<Head>
				<title>LMS</title>
				<meta property='og:title' content='LMS' />
				<meta property='og:description' content='View the upcoming assignments and get notified of future ones!' />
				<meta property='og:author' content={process.env.NEXT_PUBLIC_AUTHOR!} />
				<meta property='theme-color' content='#f7b317' />
				<meta name='theme-color' content='#f7b317' />
				<meta name='viewport' content='width=device-width, initial-scale=1.0' />
				<meta name='description' content='View the upcoming assignments and get notified of future ones!' />
			</Head>
			<main className={font.className}>
				<Component {...pageProps} />
			</main>
		</>
	);
}

export default MyApp;
