const logger = require("../../utils/logger.js");
const emojis = require("../../config/emojis.js");

const MAL_COLOR = 0x2e51a2;
const FOOTER = { text: "Powered by MyAnimeList API" };

const ANIME_STATUS = {
  finished_airing: "Đã hoàn thành",
  currently_airing: "Đang phát sóng",
  not_yet_aired: "Chưa phát sóng",
};

const MANGA_STATUS = {
  finished: "Đã hoàn thành",
  currently_publishing: "Đang xuất bản",
  not_yet_published: "Chưa xuất bản",
};

const SEASON_NAMES = { winter: "Đông", spring: "Xuân", summer: "Hạ", fall: "Thu" };

const RANKING_TITLES = {
  all: "Top Anime", airing: "Top Anime Đang Phát Sóng",
  upcoming: "Top Anime Sắp Ra Mắt", tv: "Top Anime TV Series",
  ova: "Top Anime OVA", movie: "Top Anime Movie",
  special: "Top Anime Special", bypopularity: "Top Anime Theo Độ Phổ Biến",
  favorite: "Top Anime Được Yêu Thích",
};

const ANIME_SEARCH_FIELDS = "id,title,main_picture,synopsis,mean,rank,popularity,num_episodes,media_type,status,genres,start_season,studios";
const ANIME_DETAIL_FIELDS = "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_episodes,start_season,broadcast,source,average_episode_duration,rating,pictures,background,related_anime,related_manga,recommendations,studios,statistics";
const ANIME_RANKING_FIELDS = "id,title,main_picture,mean,rank,popularity,num_episodes,media_type,status";
const MANGA_SEARCH_FIELDS = "id,title,main_picture,synopsis,mean,rank,popularity,num_volumes,num_chapters,media_type,status,genres";
const MANGA_DETAIL_FIELDS = "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_volumes,num_chapters,authors{first_name,last_name},pictures,background,related_anime,related_manga,recommendations,serialization{name}";
const MANGA_RANKING_FIELDS = "id,title,main_picture,mean,rank,popularity,num_volumes,num_chapters,media_type,status";

class MyAnimeListAPI {
  constructor() {
    this.baseURL = "https://api.myanimelist.net/v2";
    this.clientId = process.env.MAL_CLIENT_ID;
    this.timeout = 5000;

    if (!this.clientId) {
      logger.warn("api", "mal_client_id not set. MyAnimeList api will not work.");
    }
  }

  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseURL}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.append(key, value);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers: { "X-MAL-CLIENT-ID": this.clientId },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error.name === "AbortError" ? new Error("Request timeout") : error;
    }
  }

  async searchAnime(query, limit = 10) {
    try {
      const data = await this.request("/anime", { q: query, limit, fields: ANIME_SEARCH_FIELDS });
      return data.data;
    } catch (error) {
      logger.error("mal api", "Error while searching anime:", error.message);
      return [];
    }
  }

  async getAnimeDetails(animeId) {
    try {
      return await this.request(`/anime/${animeId}`, { fields: ANIME_DETAIL_FIELDS });
    } catch (error) {
      logger.error("mal api", `Error while fetching anime details for ID ${animeId}:`, error.message);
      return null;
    }
  }

  async getAnimeRanking(rankingType = "all", limit = 10) {
    try {
      const data = await this.request("/anime/ranking", { ranking_type: rankingType, limit, fields: ANIME_RANKING_FIELDS });
      return data.data;
    } catch (error) {
      logger.error("mal api", `Error while fetching anime ranking type ${rankingType}:`, error.message);
      return [];
    }
  }

  async getSeasonalAnime(year, season, limit = 10) {
    try {
      const data = await this.request(`/anime/season/${year}/${season}`, { limit, fields: ANIME_SEARCH_FIELDS });
      return data.data;
    } catch (error) {
      logger.error("mal api", `Error while fetching seasonal anime for ${season} ${year}:`, error.message);
      return [];
    }
  }

  async searchManga(query, limit = 10) {
    try {
      const data = await this.request("/manga", { q: query, limit, fields: MANGA_SEARCH_FIELDS });
      return data.data;
    } catch (error) {
      logger.error("mal api", "Error while searching manga:", error.message);
      return [];
    }
  }

  async getMangaDetails(mangaId) {
    try {
      return await this.request(`/manga/${mangaId}`, { fields: MANGA_DETAIL_FIELDS });
    } catch (error) {
      logger.error("mal api", `Error while fetching manga details for ID ${mangaId}:`, error.message);
      return null;
    }
  }

  async getMangaRanking(rankingType = "all", limit = 10) {
    try {
      const data = await this.request("/manga/ranking", { ranking_type: rankingType, limit, fields: MANGA_RANKING_FIELDS });
      return data.data;
    } catch (error) {
      logger.error("mal api", `Error while fetching manga ranking type ${rankingType}:`, error.message);
      return [];
    }
  }

  _baseEmbed(title) {
    return { color: MAL_COLOR, title, footer: FOOTER, timestamp: new Date(), fields: [] };
  }

  _truncate(text, max = 500) {
    if (!text) return "Không có mô tả.";
    return text.length > max ? text.substring(0, max) + "..." : text;
  }

  _buildSearchFields(list, formatter) {
    return list.slice(0, 5).map((item, i) => ({
      name: `${i + 1}. ${item.node.title}`,
      value: `${formatter(item.node)}\nID: ${item.node.id}`,
      inline: false,
    }));
  }

  createAnimeSearchEmbed(animeList, query) {
    const embed = this._baseEmbed(`Kết quả tìm kiếm anime cho "${query}"`);
    if (!animeList.length) { embed.description = "Không tìm thấy kết quả nào."; return embed; }

    if (animeList[0].node.main_picture) embed.thumbnail = { url: animeList[0].node.main_picture.medium };

    embed.fields = this._buildSearchFields(animeList, (anime) => {
      let info = "";
      if (anime.mean) info += `${emojis.mal.score} Điểm: ${anime.mean}/10\n`;
      if (anime.num_episodes) info += `${emojis.mal.episodes} Tập: ${anime.num_episodes}\n`;
      info += `${emojis.mal.tv} Loại: ${anime.media_type?.toUpperCase() || "N/A"}\n`;
      info += `${emojis.mal.status} Trạng thái: ${ANIME_STATUS[anime.status] || "N/A"}`;
      if (anime.genres?.length) info += `\n${emojis.mal.tags} Thể loại: ${anime.genres.slice(0, 3).map(g => g.name).join(", ")}`;
      return info;
    });

    if (animeList.length > 5) {
      embed.fields.push({ name: "Và nhiều hơn nữa...", value: `Tổng cộng ${animeList.length} kết quả.`, inline: false });
    }
    return embed;
  }

  createAnimeDetailEmbed(anime) {
    if (!anime) return { color: 0xED4245, title: "Lỗi", description: "Không thể tìm thấy thông tin anime.", footer: FOOTER, timestamp: new Date() };

    const embed = this._baseEmbed(anime.title);
    embed.url = `https://myanimelist.net/anime/${anime.id}`;
    embed.description = this._truncate(anime.synopsis);
    embed.thumbnail = anime.main_picture ? { url: anime.main_picture.medium } : null;

    embed.fields = [
      { name: `${emojis.mal.stats} Thống kê`, value: `${emojis.mal.score} Điểm: ${anime.mean || "N/A"}/10\n${emojis.mal.rank} Xếp hạng: #${anime.rank || "N/A"}\n${emojis.mal.popularity} Độ phổ biến: #${anime.popularity || "N/A"}\n${emojis.mal.users} Người dùng: ${anime.num_list_users?.toLocaleString() || "N/A"}`, inline: true },
      { name: `${emojis.mal.info} Thông tin`, value: `${emojis.mal.tv} Loại: ${anime.media_type?.toUpperCase() || "N/A"}\n${emojis.mal.episodes} Số tập: ${anime.num_episodes || "N/A"}\n${emojis.mal.status} Trạng thái: ${ANIME_STATUS[anime.status] || "N/A"}\n${emojis.mal.duration} Thời lượng: ${anime.average_episode_duration ? Math.floor(anime.average_episode_duration / 60) + " phút" : "N/A"}`, inline: true },
    ];

    if (anime.start_season) embed.fields.push({ name: `${emojis.mal.season} Mùa`, value: `${SEASON_NAMES[anime.start_season.season] || anime.start_season.season} ${anime.start_season.year}`, inline: true });
    if (anime.studios?.length) embed.fields.push({ name: `${emojis.mal.studio} Studio`, value: anime.studios.map(s => s.name).join(", "), inline: true });
    if (anime.genres?.length) embed.fields.push({ name: `${emojis.mal.tags} Thể loại`, value: anime.genres.map(g => g.name).join(", "), inline: false });

    return embed;
  }

  createAnimeRankingEmbed(rankingList, rankingType) {
    const embed = this._baseEmbed(RANKING_TITLES[rankingType] || `Top Anime - ${rankingType}`);
    if (!rankingList?.length) { embed.description = "Không có dữ liệu bảng xếp hạng."; return embed; }

    if (rankingList[0]?.node?.main_picture) embed.thumbnail = { url: rankingList[0].node.main_picture.medium };

    embed.fields = rankingList.slice(0, 5).filter(item => item && typeof item === "object").map((item, i) => {
      const anime = item.node || {};
      const ranking = item.ranking || i + 1;
      let info = "";
      if (anime.mean) info += `${emojis.mal.score} Điểm: ${anime.mean}/10\n`;
      if (anime.num_episodes) info += `${emojis.mal.episodes} Tập: ${anime.num_episodes}\n`;
      if (anime.media_type) info += `${emojis.mal.tv} Loại: ${anime.media_type.toUpperCase()}\n`;
      if (anime.id) info += `${emojis.mal.link} https://myanimelist.net/anime/${anime.id}`;
      return { name: `${ranking}. ${anime.title || "Không có tiêu đề"}`, value: info || "Không có thông tin", inline: false };
    });

    return embed;
  }

  createMangaSearchEmbed(mangaList, query) {
    const embed = this._baseEmbed(`Kết quả tìm kiếm manga cho "${query}"`);
    if (!mangaList.length) { embed.description = "Không tìm thấy kết quả nào."; return embed; }

    if (mangaList[0].node.main_picture) embed.thumbnail = { url: mangaList[0].node.main_picture.medium };

    embed.fields = this._buildSearchFields(mangaList, (manga) => {
      let info = "";
      if (manga.mean) info += `${emojis.mal.score} Điểm: ${manga.mean}/10\n`;
      if (manga.num_volumes) info += `${emojis.mal.volumes} Tập: ${manga.num_volumes}\n`;
      if (manga.num_chapters) info += `${emojis.mal.chapters} Chương: ${manga.num_chapters}\n`;
      info += `${emojis.mal.status} Trạng thái: ${MANGA_STATUS[manga.status] || "N/A"}`;
      if (manga.genres?.length) info += `\n${emojis.mal.tags} Thể loại: ${manga.genres.slice(0, 3).map(g => g.name).join(", ")}`;
      return info;
    });

    if (mangaList.length > 5) {
      embed.fields.push({ name: "Và nhiều hơn nữa...", value: `Tổng cộng ${mangaList.length} kết quả.`, inline: false });
    }
    return embed;
  }

  createMangaDetailEmbed(manga) {
    if (!manga) return { color: 0xED4245, title: "Lỗi", description: "Không thể tìm thấy thông tin manga.", footer: FOOTER, timestamp: new Date() };

    const embed = this._baseEmbed(manga.title);
    embed.url = `https://myanimelist.net/manga/${manga.id}`;
    embed.description = this._truncate(manga.synopsis);
    embed.thumbnail = manga.main_picture ? { url: manga.main_picture.medium } : null;

    embed.fields = [
      { name: `${emojis.mal.stats} Thống kê`, value: `${emojis.mal.score} Điểm: ${manga.mean || "N/A"}/10\n${emojis.mal.rank} Xếp hạng: #${manga.rank || "N/A"}\n${emojis.mal.popularity} Độ phổ biến: #${manga.popularity || "N/A"}\n${emojis.mal.users} Người dùng: ${manga.num_list_users?.toLocaleString() || "N/A"}`, inline: true },
      { name: `${emojis.mal.info} Thông tin`, value: `${emojis.mal.volumes} Tập: ${manga.num_volumes || "N/A"}\n${emojis.mal.chapters} Chương: ${manga.num_chapters || "N/A"}\n${emojis.mal.status} Trạng thái: ${MANGA_STATUS[manga.status] || "N/A"}`, inline: true },
    ];

    if (manga.authors?.length) embed.fields.push({ name: `${emojis.mal.author} Tác giả`, value: manga.authors.map(a => `${a.node.first_name} ${a.node.last_name}`).join(", "), inline: true });
    if (manga.genres?.length) embed.fields.push({ name: `${emojis.mal.tags} Thể loại`, value: manga.genres.map(g => g.name).join(", "), inline: false });

    return embed;
  }
}

module.exports = new MyAnimeListAPI();
