const logger = require("../utils/logger.js");

class MyAnimeListAPI {
  constructor() {
    this.baseURL = "https://api.myanimelist.net/v2";
    this.clientId = process.env.MAL_CLIENT_ID;
    this.timeout = 5000;

    if (!this.clientId) {
      logger.warn(
        "API",
        "MAL_CLIENT_ID không được đặt trong biến môi trường. API MyAnimeList sẽ không hoạt động."
      );
    }
  }

  /**
   * Internal fetch wrapper with timeout and default headers
   */
  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseURL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.append(key, value);
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "X-MAL-CLIENT-ID": this.clientId },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw error;
    }
  }

  async searchAnime(query, limit = 10) {
    try {
      logger.info("MAL API", `Đang tìm kiếm anime với từ khóa: "${query}"`);

      const data = await this.request("/anime", {
        q: query,
        limit,
        fields: "id,title,main_picture,synopsis,mean,rank,popularity,num_episodes,media_type,status,genres,start_season,studios",
      });

      logger.info("MAL API", `Đã tìm thấy ${data.data.length} kết quả cho "${query}"`);
      return data.data;
    } catch (error) {
      logger.error("MAL API", "Lỗi khi tìm kiếm anime:", error.message);
      return [];
    }
  }

  async getAnimeDetails(animeId) {
    try {
      logger.info("MAL API", `Đang lấy thông tin chi tiết của anime ID: ${animeId}`);

      const data = await this.request(`/anime/${animeId}`, {
        fields: "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_episodes,start_season,broadcast,source,average_episode_duration,rating,pictures,background,related_anime,related_manga,recommendations,studios,statistics",
      });

      logger.info("MAL API", `Đã lấy thông tin chi tiết của anime: ${data.title}`);
      return data;
    } catch (error) {
      logger.error("MAL API", `Lỗi khi lấy thông tin chi tiết anime ID ${animeId}:`, error.message);
      return null;
    }
  }

  async getAnimeRanking(rankingType = "all", limit = 10) {
    try {
      logger.info("MAL API", `Đang lấy bảng xếp hạng anime loại: ${rankingType}`);

      const data = await this.request("/anime/ranking", {
        ranking_type: rankingType,
        limit,
        fields: "id,title,main_picture,mean,rank,popularity,num_episodes,media_type,status",
      });

      logger.info("MAL API", `Đã lấy ${data.data.length} kết quả từ bảng xếp hạng ${rankingType}`);
      return data.data;
    } catch (error) {
      logger.error("MAL API", `Lỗi khi lấy bảng xếp hạng anime loại ${rankingType}:`, error.message);
      return [];
    }
  }

  async getSeasonalAnime(year, season, limit = 10) {
    try {
      logger.info("MAL API", `Đang lấy anime mùa ${season} năm ${year}`);

      const data = await this.request(`/anime/season/${year}/${season}`, {
        limit,
        fields: "id,title,main_picture,mean,rank,popularity,num_episodes,media_type,status,genres,start_season,studios",
      });

      logger.info("MAL API", `Đã lấy ${data.data.length} kết quả cho anime mùa ${season} năm ${year}`);
      return data.data;
    } catch (error) {
      logger.error("MAL API", `Lỗi khi lấy anime mùa ${season} năm ${year}:`, error.message);
      return [];
    }
  }

  async searchManga(query, limit = 10) {
    try {
      logger.info("MAL API", `Đang tìm kiếm manga với từ khóa: "${query}"`);

      const data = await this.request("/manga", {
        q: query,
        limit,
        fields: "id,title,main_picture,synopsis,mean,rank,popularity,num_volumes,num_chapters,media_type,status,genres",
      });

      logger.info("MAL API", `Đã tìm thấy ${data.data.length} kết quả cho "${query}"`);
      return data.data;
    } catch (error) {
      logger.error("MAL API", "Lỗi khi tìm kiếm manga:", error.message);
      return [];
    }
  }

  async getMangaDetails(mangaId) {
    try {
      logger.info("MAL API", `Đang lấy thông tin chi tiết của manga ID: ${mangaId}`);

      const data = await this.request(`/manga/${mangaId}`, {
        fields: "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_volumes,num_chapters,authors{first_name,last_name},pictures,background,related_anime,related_manga,recommendations,serialization{name}",
      });

      logger.info("MAL API", `Đã lấy thông tin chi tiết của manga: ${data.title}`);
      return data;
    } catch (error) {
      logger.error("MAL API", `Lỗi khi lấy thông tin chi tiết manga ID ${mangaId}:`, error.message);
      return null;
    }
  }

  async getMangaRanking(rankingType = "all", limit = 10) {
    try {
      logger.info("MAL API", `Đang lấy bảng xếp hạng manga loại: ${rankingType}`);

      const data = await this.request("/manga/ranking", {
        ranking_type: rankingType,
        limit,
        fields: "id,title,main_picture,mean,rank,popularity,num_volumes,num_chapters,media_type,status",
      });

      logger.info("MAL API", `Đã lấy ${data.data.length} kết quả từ bảng xếp hạng ${rankingType}`);
      return data.data;
    } catch (error) {
      logger.error("MAL API", `Lỗi khi lấy bảng xếp hạng manga loại ${rankingType}:`, error.message);
      return [];
    }
  }

  // Status mapping helpers
  _getAnimeStatus(status) {
    const statusMap = {
      finished_airing: "Đã hoàn thành",
      currently_airing: "Đang phát sóng",
      not_yet_aired: "Chưa phát sóng",
    };
    return statusMap[status] || "N/A";
  }

  _getMangaStatus(status) {
    const statusMap = {
      finished: "Đã hoàn thành",
      currently_publishing: "Đang xuất bản",
      not_yet_published: "Chưa xuất bản",
    };
    return statusMap[status] || "N/A";
  }

  _getSeasonName(season) {
    const seasonMap = { winter: "Đông", spring: "Xuân", summer: "Hạ", fall: "Thu" };
    return seasonMap[season] || season;
  }

  createAnimeSearchEmbed(animeList, query) {
    const embed = {
      color: 0x2e51a2,
      title: `Kết quả tìm kiếm anime cho "${query}"`,
      footer: { text: "Powered by MyAnimeList API" },
      timestamp: new Date(),
      fields: [],
    };

    if (animeList.length === 0) {
      embed.description = "Không tìm thấy kết quả nào.";
      return embed;
    }

    const topResults = animeList.slice(0, 5);

    if (topResults[0].node.main_picture) {
      embed.thumbnail = { url: topResults[0].node.main_picture.medium };
    }

    topResults.forEach((item, index) => {
      const anime = item.node;
      const status = this._getAnimeStatus(anime.status);

      let info = "";
      if (anime.mean) info += `⭐ Điểm: ${anime.mean}/10\n`;
      if (anime.num_episodes) info += `🎬 Tập: ${anime.num_episodes}\n`;
      info += `📺 Loại: ${anime.media_type?.toUpperCase() || "N/A"}\n`;
      info += `📅 Trạng thái: ${status}\n`;

      if (anime.genres?.length > 0) {
        const genreList = anime.genres.map((g) => g.name).slice(0, 3).join(", ");
        info += `🏷️ Thể loại: ${genreList}`;
      }

      embed.fields.push({
        name: `${index + 1}. ${anime.title}`,
        value: `${info}\nID: ${anime.id}`,
        inline: false,
      });
    });

    if (animeList.length > 5) {
      embed.fields.push({
        name: "Và nhiều hơn nữa...",
        value: `Tìm thấy tổng cộng ${animeList.length} kết quả.`,
        inline: false,
      });
    }

    return embed;
  }

  createAnimeDetailEmbed(anime) {
    if (!anime) {
      return {
        color: 0xff0000,
        title: "Lỗi",
        description: "Không thể tìm thấy thông tin anime.",
        footer: { text: "Powered by MyAnimeList API" },
        timestamp: new Date(),
      };
    }

    const status = this._getAnimeStatus(anime.status);
    let synopsis = anime.synopsis || "Không có mô tả.";
    if (synopsis.length > 500) synopsis = synopsis.substring(0, 500) + "...";

    const embed = {
      color: 0x2e51a2,
      title: anime.title,
      url: `https://myanimelist.net/anime/${anime.id}`,
      description: synopsis,
      thumbnail: anime.main_picture ? { url: anime.main_picture.medium } : null,
      fields: [
        {
          name: "📊 Thống kê",
          value: `⭐ Điểm: ${anime.mean || "N/A"}/10\n🏆 Xếp hạng: #${anime.rank || "N/A"}\n❤️ Độ phổ biến: #${anime.popularity || "N/A"}\n👥 Người dùng: ${anime.num_list_users?.toLocaleString() || "N/A"}`,
          inline: true,
        },
        {
          name: "📝 Thông tin",
          value: `📺 Loại: ${anime.media_type?.toUpperCase() || "N/A"}\n🎬 Số tập: ${anime.num_episodes || "N/A"}\n📅 Trạng thái: ${status}\n⌛ Thời lượng: ${anime.average_episode_duration ? Math.floor(anime.average_episode_duration / 60) + " phút" : "N/A"}`,
          inline: true,
        },
      ],
      footer: { text: "Powered by MyAnimeList API" },
      timestamp: new Date(),
    };

    if (anime.start_season) {
      embed.fields.push({
        name: "🗓️ Mùa",
        value: `${this._getSeasonName(anime.start_season.season)} ${anime.start_season.year}`,
        inline: true,
      });
    }

    if (anime.studios?.length > 0) {
      embed.fields.push({
        name: "🏢 Studio",
        value: anime.studios.map((s) => s.name).join(", "),
        inline: true,
      });
    }

    if (anime.genres?.length > 0) {
      embed.fields.push({
        name: "🏷️ Thể loại",
        value: anime.genres.map((g) => g.name).join(", "),
        inline: false,
      });
    }

    return embed;
  }

  createAnimeRankingEmbed(rankingList, rankingType) {
    const rankingTitles = {
      all: "Top Anime",
      airing: "Top Anime Đang Phát Sóng",
      upcoming: "Top Anime Sắp Ra Mắt",
      tv: "Top Anime TV Series",
      ova: "Top Anime OVA",
      movie: "Top Anime Movie",
      special: "Top Anime Special",
      bypopularity: "Top Anime Theo Độ Phổ Biến",
      favorite: "Top Anime Được Yêu Thích",
    };

    const embed = {
      color: 0x2e51a2,
      title: rankingTitles[rankingType] || `Top Anime - ${rankingType}`,
      footer: { text: "Powered by MyAnimeList API" },
      timestamp: new Date(),
      fields: [],
    };

    if (!rankingList || rankingList.length === 0) {
      embed.description = "Không có dữ liệu bảng xếp hạng.";
      return embed;
    }

    const topResults = rankingList.slice(0, 5);

    if (topResults[0]?.node?.main_picture) {
      embed.thumbnail = { url: topResults[0].node.main_picture.medium };
    }

    logger.info("MAL API", `Tạo embed cho ${topResults.length} kết quả ranking`);

    topResults.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        logger.warn("MAL API", `Phần tử không hợp lệ ở vị trí ${index}: ${JSON.stringify(item)}`);
        return;
      }

      const anime = item.node || {};
      const ranking = item.ranking || index + 1;
      const title = anime.title || "Không có tiêu đề";

      let info = "";
      if (anime.mean) info += `⭐ Điểm: ${anime.mean}/10\n`;
      if (anime.num_episodes) info += `🎬 Tập: ${anime.num_episodes}\n`;
      if (anime.media_type) info += `📺 Loại: ${anime.media_type.toUpperCase()}\n`;
      if (anime.id) info += `🔗 https://myanimelist.net/anime/${anime.id}`;

      embed.fields.push({
        name: `${ranking}. ${title}`,
        value: info || "Không có thông tin",
        inline: false,
      });
    });

    return embed;
  }

  createMangaSearchEmbed(mangaList, query) {
    const embed = {
      color: 0x2e51a2,
      title: `Kết quả tìm kiếm manga cho "${query}"`,
      footer: { text: "Powered by MyAnimeList API" },
      timestamp: new Date(),
      fields: [],
    };

    if (mangaList.length === 0) {
      embed.description = "Không tìm thấy kết quả nào.";
      return embed;
    }

    const topResults = mangaList.slice(0, 5);

    if (topResults[0].node.main_picture) {
      embed.thumbnail = { url: topResults[0].node.main_picture.medium };
    }

    topResults.forEach((item, index) => {
      const manga = item.node;
      const status = this._getMangaStatus(manga.status);

      let info = "";
      if (manga.mean) info += `⭐ Điểm: ${manga.mean}/10\n`;
      if (manga.num_volumes) info += `📚 Tập: ${manga.num_volumes}\n`;
      if (manga.num_chapters) info += `📑 Chương: ${manga.num_chapters}\n`;
      info += `📅 Trạng thái: ${status}\n`;

      if (manga.genres?.length > 0) {
        const genreList = manga.genres.map((g) => g.name).slice(0, 3).join(", ");
        info += `🏷️ Thể loại: ${genreList}`;
      }

      embed.fields.push({
        name: `${index + 1}. ${manga.title}`,
        value: `${info}\nID: ${manga.id}`,
        inline: false,
      });
    });

    if (mangaList.length > 5) {
      embed.fields.push({
        name: "Và nhiều hơn nữa...",
        value: `Tìm thấy tổng cộng ${mangaList.length} kết quả.`,
        inline: false,
      });
    }

    return embed;
  }

  createMangaDetailEmbed(manga) {
    if (!manga) {
      return {
        color: 0xff0000,
        title: "Lỗi",
        description: "Không thể tìm thấy thông tin manga.",
        footer: { text: "Powered by MyAnimeList API" },
        timestamp: new Date(),
      };
    }

    const status = this._getMangaStatus(manga.status);
    let synopsis = manga.synopsis || "Không có mô tả.";
    if (synopsis.length > 500) synopsis = synopsis.substring(0, 500) + "...";

    const embed = {
      color: 0x2e51a2,
      title: manga.title,
      url: `https://myanimelist.net/manga/${manga.id}`,
      description: synopsis,
      thumbnail: manga.main_picture ? { url: manga.main_picture.medium } : null,
      fields: [
        {
          name: "📊 Thống kê",
          value: `⭐ Điểm: ${manga.mean || "N/A"}/10\n🏆 Xếp hạng: #${manga.rank || "N/A"}\n❤️ Độ phổ biến: #${manga.popularity || "N/A"}\n👥 Người dùng: ${manga.num_list_users?.toLocaleString() || "N/A"}`,
          inline: true,
        },
        {
          name: "📝 Thông tin",
          value: `📚 Tập: ${manga.num_volumes || "N/A"}\n📑 Chương: ${manga.num_chapters || "N/A"}\n📅 Trạng thái: ${status}`,
          inline: true,
        },
      ],
      footer: { text: "Powered by MyAnimeList API" },
      timestamp: new Date(),
    };

    if (manga.authors?.length > 0) {
      const authorNames = manga.authors.map((a) => `${a.node.first_name} ${a.node.last_name}`).join(", ");
      embed.fields.push({
        name: "✍️ Tác giả",
        value: authorNames,
        inline: true,
      });
    }

    if (manga.genres?.length > 0) {
      embed.fields.push({
        name: "🏷️ Thể loại",
        value: manga.genres.map((g) => g.name).join(", "),
        inline: false,
      });
    }

    return embed;
  }
}

module.exports = new MyAnimeListAPI();
