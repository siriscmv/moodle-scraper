import db from '@db';
import { schedule } from 'node-cron';
import login, { defaultHeaders } from '@utils/login';
import { courseIDs } from '@utils/courses';
import * as cheerio from 'cheerio';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs'; //@ts-ignore
import * as pdf from 'pdf-page-counter';
import fetch from 'node-fetch';
import kv from './kv';

const streamPipeline = promisify(pipeline);

export interface File {
	name: string;
	id: number;
	ext: string;
	topic: string;
	course: number;
	pages: number;
	modified: number;
	position: number;
}

export default async function start() {
	await refresh();
	schedule(
		'0 3 * * *', // Every day at 3 AM
		refresh,
		{
			scheduled: true,
			timezone: 'Asia/Kolkata'
		}
	);
}

const refresh = async () => {
	const files = await db.files.findMany({
		select: { id: true, modified: true, name: false, topic: false, course: false, pages: false }
	});

	const newFiles = await getFiles(files);
	if (!newFiles) return;

	for (const f of newFiles) {
		await db.files.upsert({
			where: { id: f.id },
			update: f,
			create: f
		});
	}

	kv.set('flr', Date.now());
};

export async function getFiles(existingFiles: { id: number; modified: number }[]) {
	const creds = await login();
	const newFiles: File[] = [];

	for (const course of courseIDs) {
		let position = 0;
		const html = await (
			await fetch(`https://${process.env.NEXT_PUBLIC_HOST}/course/view.php?id=${course}`, {
				method: 'GET',
				headers: {
					'Content-Type': '*',
					Cookie: creds.cookie,
					...defaultHeaders
				}
			})
		).text();

		const $ = cheerio.load(html);
		const topics = $('ul[class="topics"] > li').toArray();

		for (const topic of topics) {
			const subTopic = $(topic).find('div:first > div:first > h3').text().trim();
			const files = $(topic).find('div > ul > li').toArray();

			for (const f of files) {
				try {
					const file = $(f).find('div > div > div > div > div > div > div > a');
					const url = $(file).attr('href');
					if (!url) continue;

					const name = $(file)
						.find('span[class="instancename"]')
						.first()
						.text()
						.trim()
						.split(' ')
						.slice(0, -1)
						.join(' ');
					const id = parseInt(url.split('id=')[1]);

					if (!url.includes('resource')) continue;

					const headers: Record<string, string> = {
						'Content-Type': '*',
						Cookie: creds.cookie,
						...defaultHeaders
					};
					const existingFile = existingFiles.find((f) => f.id === id);

					if (existingFile) {
						headers['If-Modified-Since'] = new Date(existingFile.modified * 1000).toUTCString();
					}

					const downloaded = await fetch(url, {
						method: 'GET',
						headers
					});

					if (existingFile && downloaded.status === 304) {
						++position;
						continue;
					}

					const ext = downloaded.headers.get('content-disposition')!.match(/filename=".*\.(\w+)"/)![1];

					await streamPipeline(
						//@ts-ignore
						downloaded.body!,
						createWriteStream(`./files/${id}.${ext}`, {
							flags: 'w'
						})
					);

					const downloadedFile = await readFile(`./files/${id}.${ext}`);
					const { numpages } = await pdf(downloadedFile).catch(() => ({
						numpages: null
					}));

					newFiles.push({
						id,
						name,
						ext,
						topic: subTopic,
						course,
						pages: numpages,
						position,
						modified: Math.round(new Date(downloaded.headers.get('last-modified')!).getTime() / 1000)
					});

					++position;
				} catch (_) {
					++position;
					continue;
				}
			}
		}
	}

	return newFiles;
}
