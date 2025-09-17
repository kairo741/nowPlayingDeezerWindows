import express, { Request, Response } from "express";
import { exec } from "child_process";
import axios from "axios";
import querystring from "querystring";
import path from "path";
import dotenv from "dotenv";
import os from "os";
import { DeezerMusicMonitor, getCurrentMusicInfo } from "./index";

dotenv.config();

const app = express();
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PLAYERCTL_INSTANCE = process.env.PLAYERCTL_INSTANCE || "chromium.instance3";

let spotifyToken: string | null = null;
let deezerMonitor: DeezerMusicMonitor | null = null;

interface NowPlayingData {
	artist: string;
	title: string;
	coverUrl: string;
}

interface MusicInfo {
	artist: string;
	title: string;
	album?: string;
}

async function getSpotifyToken(): Promise<string> {
	if (spotifyToken) return spotifyToken;

	if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
		throw new Error(
			"Spotify credentials are not set in the environment variables.",
		);
	}

	const response = await axios.post<{ access_token: string }>(
		"https://accounts.spotify.com/api/token",
		querystring.stringify({
			grant_type: "client_credentials",
		}),
		{
			headers: {
				Authorization:
					"Basic " +
					Buffer.from(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET).toString(
						"base64",
					),
				"Content-Type": "application/x-www-form-urlencoded",
			},
		},
	);
	spotifyToken = response.data.access_token;
	return spotifyToken;
}

// Função para obter música do Deezer no Windows
async function getDeezerMusic(): Promise<MusicInfo | null> {
	try {
		if (!deezerMonitor) {
			deezerMonitor = new DeezerMusicMonitor();
			deezerMonitor.start();
		}

		return deezerMonitor.getCurrentMusic();
	} catch (error) {
		console.error("Erro ao obter música do Deezer:", error);
		return null;
	}
}

// Função para obter música do Spotify no Windows (usando playerctl se disponível)
async function getSpotifyMusicWindows(): Promise<MusicInfo | null> {
	return new Promise((resolve, reject) => {
		const command = `playerctl -p ${ PLAYERCTL_INSTANCE } metadata --format "{{ artist }} - {{ title }}"`;

		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(`Erro ao executar playerctl: ${ error }`);
				resolve(null);
				return;
			}

			const output = stdout.trim();
			if (!output) {
				resolve(null);
				return;
			}

			const [artist, title] = output.split(" - ");
			if (artist && title) {
				resolve({
					artist: artist.trim(),
					title: title.trim(),
				});
			} else {
				resolve(null);
			}
		});
	});
}

async function getNowPlaying(): Promise<NowPlayingData> {
	const platform = os.platform();
	let musicInfo: MusicInfo | null = null;

	switch (platform) {
		case "darwin": // macOS
			musicInfo = await getMacOSMusic();
			break;
		case "win32": // Windows
			musicInfo = await getWindowsMusic();
			break;
		default: // Linux
			musicInfo = await getLinuxMusic();
	}

	if (!musicInfo) {
		throw new Error("No music detected");
	}

	const { artist, title } = musicInfo;

	console.log(`Cleaned metadata: Artist: ${ artist }, Title: ${ title }`);

	try {
		const token = await getSpotifyToken();
		const searchUrl = `https://api.spotify.com/v1/search?q=${ encodeURIComponent(
			artist + " " + title,
		) }&type=track&limit=1`;
		const searchResponse = await axios.get<{
			tracks: {
				items: Array<{ album: { images: Array<{ url: string }> } }>;
			};
		}>(searchUrl, {
			headers: { Authorization: "Bearer " + token },
		});
		let coverUrl = "";
		if (searchResponse.data.tracks.items.length > 0) {
			coverUrl = searchResponse.data.tracks.items[0].album.images[0].url;
		}
		return { artist, title, coverUrl };
	} catch (searchError) {
		console.error("Error fetching album cover:", searchError);
		throw new Error("Error fetching data");
	}
}

// Função para obter música no macOS
async function getMacOSMusic(): Promise<MusicInfo | null> {
	return new Promise((resolve, reject) => {
		const command = `osascript -e 'tell application "Google Chrome" to return title of active tab of front window'`;

		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(`exec error: ${ error }`);
				reject("An error occurred");
				return;
			}

			const output = stdout.trim();
			const parts = output.split(" - ");
			if (parts.length >= 2) {
				const title = parts[0].trim();
				const artist = parts[1].trim();
				resolve({ artist, title });
			} else {
				reject("Unable to parse song information");
			}
		});
	});
}

// Função para obter música no Windows
async function getWindowsMusic(): Promise<MusicInfo | null> {
	// Primeiro tenta obter do Deezer
	let musicInfo = await getDeezerMusic();

	if (musicInfo) {
		console.log("Música detectada do Deezer:", musicInfo);
		return musicInfo;
	}

	// Se não encontrou no Deezer, tenta Spotify via playerctl
	musicInfo = await getSpotifyMusicWindows();

	if (musicInfo) {
		console.log("Música detectada do Spotify:", musicInfo);
		return musicInfo;
	}

	console.log("Nenhuma música detectada no Windows");
	return null;
}

// Função para obter música no Linux
async function getLinuxMusic(): Promise<MusicInfo | null> {
	return new Promise((resolve, reject) => {
		const command = `playerctl -p ${ PLAYERCTL_INSTANCE } metadata --format "{{ artist }} - {{ title }}"`;

		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(`exec error: ${ error }`);
				reject("An error occurred");
				return;
			}

			const output = stdout.trim();
			const [artist, title] = output.split(" - ");

			if (artist && title) {
				const cleanArtist = artist.split(",")[0].trim();
				const cleanTitle = title.replace(/-$/, "").trim();
				resolve({ artist: cleanArtist, title: cleanTitle });
			} else {
				reject("Unable to parse song information");
			}
		});
	});
}

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/now-playing/:theme?", (req, res) => {
	const theme = req.params.theme || "default";
	const themeFile = `${ theme }-theme.html`;
	console.log("------------------- Theme ------------------"+themeFile);

	const filePath = path.join(__dirname, "public", themeFile);
	res.sendFile(filePath, (err) => {
		if (err) {
			console.error(`Fichier non trouvé : ${ filePath }`);
			// Charge le thème par défaut en cas d'erreur
			const defaultFilePath = path.join(__dirname, "public", "default-theme.html");
			res.sendFile(defaultFilePath, (defaultErr) => {
				if (defaultErr) {
					console.error(`Fichier par défaut non trouvé : ${ defaultFilePath }`);
					res.status(404).send("Aucun thème disponible.");
				}
			});
		}
	});
});

app.get("/now-playing-data", async (req: Request, res: Response) => {
	try {
		const data = await getNowPlaying();
		res.json(data);
	} catch (error) {
		res.status(500).json({ error: "Error fetching data" });
	}
});

// Endpoint específico para obter música do Deezer no Windows
app.get("/deezer-music", async (req: Request, res: Response) => {
	try {
		const music = await getDeezerMusic();
		if (music) {
			res.json(music);
		} else {
			res.status(404).json({ error: "No music detected" });
		}
	} catch (error) {
		res.status(500).json({ error: "Error fetching Deezer music" });
	}
});

// Endpoint para obter informações da sessão atual
app.get("/current-session", async (req: Request, res: Response) => {
	try {
		if (!deezerMonitor) {
			deezerMonitor = new DeezerMusicMonitor();
			deezerMonitor.start();
		}

		const session = deezerMonitor.getCurrentSession();
		const isPlaying = deezerMonitor.isMusicPlaying();

		res.json({
			session,
			isPlaying,
			platform: os.platform()
		});
	} catch (error) {
		res.status(500).json({ error: "Error fetching session info" });
	}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running on port ${ PORT }`);
	console.log(`Platform: ${ os.platform() }`);

	// Inicializa o monitor do Deezer se estiver no Windows
	if (os.platform() === "win32") {
		console.log("Windows detected - initializing Deezer monitor");
		deezerMonitor = new DeezerMusicMonitor();
		deezerMonitor.start();
	}
});

// Cleanup ao encerrar o servidor
process.on('SIGINT', () => {
	console.log('\n🛑 Encerrando servidor...');
	if (deezerMonitor) {
		deezerMonitor.stop();
	}
	process.exit(0);
});

process.on('SIGTERM', () => {
	console.log('\n🛑 Encerrando servidor...');
	if (deezerMonitor) {
		deezerMonitor.stop();
	}
	process.exit(0);
});
