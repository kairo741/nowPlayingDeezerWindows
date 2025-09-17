import { SMTCMonitor } from '@coooookies/windows-smtc-monitor';

interface MusicInfo {
  artist: string;
  title: string;
  album?: string;
}

class DeezerMusicMonitor {
  private monitor: SMTCMonitor;
  private currentMusic: MusicInfo | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.monitor = new SMTCMonitor();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Monitora mudanças na sessão atual
    this.monitor.on('current-session-changed', (session: any) => {
      console.log('Sessão mudou:', session);
      this.checkCurrentMusic();
    });
  }

  private checkCurrentMusic(): void {
    // Verifica se há uma sessão ativa e obtém as informações da música
    if (this.monitor.sessions && this.monitor.sessions.length > 0) {
      const currentSession = this.monitor.sessions[0];
      console.log('Sessão atual:', currentSession);
      
      // Tenta extrair informações da música da sessão
      if (currentSession) {
        this.extractMusicInfo(currentSession);
      }
    }
  }

  private extractMusicInfo(session: any): void {
    // Tenta diferentes propriedades onde as informações podem estar
    let musicInfo: MusicInfo | null = null;

    // Verifica se há propriedades de mídia
    if (session.media) {
      musicInfo = {
        artist: session.media.artist || '',
        title: session.media.title || '',
        album: session.media.album || ''
      };
    }
    // Verifica se há propriedades diretas
    else if (session.artist || session.title) {
      musicInfo = {
        artist: session.artist || '',
        title: session.title || '',
        album: session.album || ''
      };
    }
    // Verifica se há dados de timeline (que podem indicar que há música tocando)
    else if (session.timeline && session.timeline.duration > 0) {
      // Se há timeline mas não conseguimos extrair artista/título, 
      // pelo menos sabemos que há música tocando
      console.log('Música detectada (sem detalhes):', {
        duration: session.timeline.duration,
        position: session.timeline.position,
        playbackStatus: session.playback?.playbackStatus
      });
      
      // Detecta mudanças de playback
      if (session.playback) {
        this.handlePlaybackStatus(session.playback.playbackStatus);
      }
    }

    // Se encontrou informações e elas mudaram, loga
    if (musicInfo && this.hasMusicChanged(musicInfo)) {
      this.currentMusic = musicInfo;
      this.logMusicChange('Nova música detectada', musicInfo);
    }
  }

  private handlePlaybackStatus(status: number): void {
    switch (status) {
      case 0: // Stopped
        this.logMusicChange('Música parou', null);
        this.currentMusic = null;
        break;
      case 1: // Playing
        this.logMusicChange('Música tocando', this.currentMusic);
        break;
      case 2: // Paused
        this.logMusicChange('Música pausada', this.currentMusic);
        break;
      default:
        console.log('Status de playback desconhecido:', status);
    }
  }

  private hasMusicChanged(newMusic: MusicInfo): boolean {
    if (!this.currentMusic) return true;
    
    return (
      this.currentMusic.artist !== newMusic.artist ||
      this.currentMusic.title !== newMusic.title ||
      this.currentMusic.album !== newMusic.album
    );
  }

  private logMusicChange(action: string, musicInfo: MusicInfo | null): void {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    if (musicInfo && musicInfo.artist && musicInfo.title) {
      console.log(`[${timestamp}] ${action}:`);
      console.log(`  🎵 ${musicInfo.title}`);
      console.log(`  👤 ${musicInfo.artist}`);
      if (musicInfo.album) {
        console.log(`  💿 ${musicInfo.album}`);
      }
      console.log('─'.repeat(50));
    } else {
      console.log(`[${timestamp}] ${action}`);
      console.log('─'.repeat(50));
    }
  }

  /**
   * Obtém as informações da música atual
   * @returns MusicInfo | null - Informações da música atual ou null se não houver música
   */
  public getCurrentMusic(): MusicInfo | null {
    // Se não está inicializado, inicializa primeiro
    if (!this.isInitialized) {
      this.start();
    }

    // Verifica se há uma sessão ativa e atualiza as informações
    if (this.monitor.sessions && this.monitor.sessions.length > 0) {
      const currentSession = this.monitor.sessions[0];
      if (currentSession && currentSession.media) {
        const musicInfo: MusicInfo = {
          artist: currentSession.media.artist || '',
          title: currentSession.media.title || '',
          album: currentSession.media.albumTitle || ''
        };
        
        // Atualiza a música atual se mudou
        if (this.hasMusicChanged(musicInfo)) {
          this.currentMusic = musicInfo;
        }
      }
    }

    return this.currentMusic;
  }

  /**
   * Obtém informações detalhadas da sessão atual
   * @returns object | null - Informações completas da sessão ou null se não houver sessão
   */
  public getCurrentSession(): any | null {
    if (!this.isInitialized) {
      this.start();
    }

    if (this.monitor.sessions && this.monitor.sessions.length > 0) {
      return this.monitor.sessions[0];
    }

    return null;
  }

  /**
   * Verifica se há música tocando atualmente
   * @returns boolean - true se há música tocando, false caso contrário
   */
  public isMusicPlaying(): boolean {
    const session = this.getCurrentSession();
    if (!session) return false;

    // Verifica se há informações de mídia
    if (session.media && session.media.title && session.media.artist) {
      return true;
    }

    // Verifica se há timeline ativa
    if (session.timeline && session.timeline.duration > 0) {
      return true;
    }

    return false;
  }

  public start(): void {
    if (this.isInitialized) {
      console.log('Monitor já está inicializado');
      return;
    }

    console.log('🎧 Iniciando monitoramento do Deezer Desktop...');
    console.log('Aguardando mudanças na música...');
    console.log('─'.repeat(50));
    
    try {
      // Usa any para contornar o problema de acesso privado
      (this.monitor as any)._initialize();
      this.isInitialized = true;
    } catch (error) {
      console.error('Erro ao inicializar monitor:', error);
    }
  }

  public stop(): void {
    console.log('🛑 Parando monitoramento do Deezer Desktop...');
    if (this.isInitialized) {
      this.monitor.destroy();
      this.isInitialized = false;
    }
  }
}

// Função principal para iniciar o monitoramento
function startDeezerMonitoring(): void {
  const musicMonitor = new DeezerMusicMonitor();
  
  // Inicia o monitoramento
  musicMonitor.start();

  // Tratamento de encerramento gracioso
  process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando monitoramento...');
    musicMonitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Encerrando monitoramento...');
    musicMonitor.stop();
    process.exit(0);
  });
}

// Função para obter música atual (sem monitoramento contínuo)
function getCurrentMusic(): void {
  const monitor = new DeezerMusicMonitor();
  monitor.start();
  
  // Aguarda um pouco para que as sessões sejam carregadas
  setTimeout(() => {
    const music = monitor.getCurrentMusic();
    if (music) {
      console.log('🎵 Música atual:');
      console.log(`  Título: ${music.title}`);
      console.log(`  Artista: ${music.artist}`);
      if (music.album) {
        console.log(`  Álbum: ${music.album}`);
      }
    } else {
      console.log('❌ Nenhuma música detectada');
    }
    
    monitor.stop();
    process.exit(0);
  }, 1000);
}

// Inicia o monitoramento quando o script for executado
if (require.main === module) {
  // Se passou argumento --get, usa a função get
  if (process.argv.includes('--get')) {
    getCurrentMusic();
  } else {
    startDeezerMonitoring();
  }
}

// Função para obter música atual de forma síncrona (para uso programático)
async function getCurrentMusicInfo(): Promise<MusicInfo | null> {
  return new Promise((resolve) => {
    const monitor = new DeezerMusicMonitor();
    monitor.start();
    
    // Aguarda um pouco para que as sessões sejam carregadas
    setTimeout(() => {
      const music = monitor.getCurrentMusic();
      monitor.stop();
      resolve(music);
    }, 1000);
  });
}

export { DeezerMusicMonitor, startDeezerMonitoring, getCurrentMusic, getCurrentMusicInfo };
