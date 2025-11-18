const axios = require("axios");
const logger = require("../utils/logger.js");
const { EmbedBuilder } = require("discord.js");

class MyAnimeListAPI {
  constructor() {
    this.baseURL = "https://api.myanimelist.net/v2";
    this.clientId = process.env.MAL_CLIENT_ID;

    if (!this.clientId) {
      logger.warn(
        "API",
        "MAL_CLIENT_ID không được đặt trong biến môi trường. API MyAnimeList sẽ không hoạt động."
      );
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        "X-MAL-CLIENT-ID": this.clientId,
      },
      timeout: 5000,
    });
  }

  
  async searchAnime(query, limit = 10) {
    try {
      logger.info("MAL API", `Đang tìm kiếm anime với từ khóa: "${query}"`);

      const response = await this.axiosInstance.get("/anime", {
        params: {
          q: query,
          limit: limit,
          fields:
            "id,title,main_picture,synopsis,mean,rank,popularity,num_episodes,media_type,status,genres,start_season,studios",
        },
      });

      logger.info(
        "MAL API",
        `Đã tìm thấy ${response.data.data.length} kết quả cho "${query}"`
      );
      return response.data.data;
    } catch (error) {
      logger.error("MAL API", "Lỗi khi tìm kiếm anime:", error.message);
      return [];
    }
  }

  
  async getAnimeDetails(animeId) {
    try {
      logger.info(
        "MAL API",
        `Đang lấy thông tin chi tiết của anime ID: ${animeId}`
      );

      const response = await this.axiosInstance.get(`/anime/${animeId}`, {
        params: {
          fields:
            "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_episodes,start_season,broadcast,source,average_episode_duration,rating,pictures,background,related_anime,related_manga,recommendations,studios,statistics",
        },
      });

      logger.info(
        "MAL API",
        `Đã lấy thông tin chi tiết của anime: ${response.data.title}`
      );
      return response.data;
    } catch (error) {
      logger.error(
        "MAL API",
        `Lỗi khi lấy thông tin chi tiết anime ID ${animeId}:`,
        error.message
      );
      return null;
    }
  }

  
  async getAnimeRanking(rankingType = "all", limit = 10) {
    try {
      logger.info(
        "MAL API",
        `Đang lấy bảng xếp hạng anime loại: ${rankingType}`
      );

      const response = await this.axiosInstance.get("/anime/ranking", {
        params: {
          ranking_type: rankingType,
          limit: limit,
          fields:
            "id,title,main_picture,mean,rank,popularity,num_episodes,media_type,status",
        },
      });

      logger.info(
        "MAL API",
        `Đã lấy ${response.data.data.length} kết quả từ bảng xếp hạng ${rankingType}`
      );
      return response.data.data;
    } catch (error) {
      logger.error(
        "MAL API",
        `Lỗi khi lấy bảng xếp hạng anime loại ${rankingType}:`,
        error.message
      );
      return [];
    }
  }

  
  async getSeasonalAnime(year, season, limit = 10) {
    try {
      logger.info("MAL API", `Đang lấy anime mùa ${season} năm ${year}`);

      const response = await this.axiosInstance.get(
        `/anime/season/${year}/${season}`,
        {
          params: {
            limit: limit,
            fields:
              "id,title,main_picture,mean,rank,popularity,num_episodes,media_type,status,genres,start_season,studios",
          },
        }
      );

      logger.info(
        "MAL API",
        `Đã lấy ${response.data.data.length} kết quả cho anime mùa ${season} năm ${year}`
      );
      return response.data.data;
    } catch (error) {
      logger.error(
        "MAL API",
        `Lỗi khi lấy anime mùa ${season} năm ${year}:`,
        error.message
      );
      return [];
    }
  }

  
  async searchManga(query, limit = 10) {
    try {
      logger.info("MAL API", `Đang tìm kiếm manga với từ khóa: "${query}"`);

      const response = await this.axiosInstance.get("/manga", {
        params: {
          q: query,
          limit: limit,
          fields:
            "id,title,main_picture,synopsis,mean,rank,popularity,num_volumes,num_chapters,media_type,status,genres",
        },
      });

      logger.info(
        "MAL API",
        `Đã tìm thấy ${response.data.data.length} kết quả cho "${query}"`
      );
      return response.data.data;
    } catch (error) {
      logger.error("MAL API", "Lỗi khi tìm kiếm manga:", error.message);
      return [];
    }
  }

  
  async getMangaDetails(mangaId) {
    try {
      logger.info(
        "MAL API",
        `Đang lấy thông tin chi tiết của manga ID: ${mangaId}`
      );

      const response = await this.axiosInstance.get(`/manga/${mangaId}`, {
        params: {
          fields:
            "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_volumes,num_chapters,authors{first_name,last_name},pictures,background,related_anime,related_manga,recommendations,serialization{name}",
        },
      });

      logger.info(
        "MAL API",
        `Đã lấy thông tin chi tiết của manga: ${response.data.title}`
      );
      return response.data;
    } catch (error) {
      logger.error(
        "MAL API",
        `Lỗi khi lấy thông tin chi tiết manga ID ${mangaId}:`,
        error.message
      );
      return null;
    }
  }

  
  async getMangaRanking(rankingType = "all", limit = 10) {
    try {
      logger.info(
        "MAL API",
        `Đang lấy bảng xếp hạng manga loại: ${rankingType}`
      );

      const response = await this.axiosInstance.get("/manga/ranking", {
        params: {
          ranking_type: rankingType,
          limit: limit,
          fields:
            "id,title,main_picture,mean,rank,popularity,num_volumes,num_chapters,media_type,status",
        },
      });

      logger.info(
        "MAL API",
        `Đã lấy ${response.data.data.length} kết quả từ bảng xếp hạng ${rankingType}`
      );
      return response.data.data;
    } catch (error) {
      logger.error(
        "MAL API",
        `Lỗi khi lấy bảng xếp hạng manga loại ${rankingType}:`,
        error.message
      );
      return [];
    }
  }

  
  createAnimeSearchEmbed(animeList, query) {
    const embed = {
      color: 0x2e51a2, // Màu xanh của MyAnimeList
      title: `Kết quả tìm kiếm anime cho "${query}"`,
      footer: {
        text: "Powered by MyAnimeList API",
      },
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

    // Thêm các kết quả vào embed
    topResults.forEach((item, index) => {
      const anime = item.node;
      let status = "N/A";
      switch (anime.status) {
        case "finished_airing":
          status = "Đã hoàn thành";
          break;
        case "currently_airing":
          status = "Đang phát sóng";
          break;
        case "not_yet_aired":
          status = "Chưa phát sóng";
          break;
      }

      let info = "";
      if (anime.mean) info += `⭐ Điểm: ${anime.mean}/10\n`;
      if (anime.num_episodes) info += `🎬 Tập: ${anime.num_episodes}\n`;
      info += `📺 Loại: ${anime.media_type?.toUpperCase() || "N/A"}\n`;
      info += `📅 Trạng thái: ${status}\n`;

      if (anime.genres && anime.genres.length > 0) {
        const genreList = anime.genres
          .map((g) => g.name)
          .slice(0, 3)
          .join(", ");
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
    if (!anime)
      return {
        color: 0xff0000,
        title: "Lỗi",
        description: "Không thể tìm thấy thông tin anime.",
        footer: { text: "Powered by MyAnimeList API" },
        timestamp: new Date(),
      };

    let status = "N/A";
    switch (anime.status) {
      case "finished_airing":
        status = "Đã hoàn thành";
        break;
      case "currently_airing":
        status = "Đang phát sóng";
        break;
      case "not_yet_aired":
        status = "Chưa phát sóng";
        break;
    }

    let synopsis = anime.synopsis || "Không có mô tả.";
    if (synopsis.length > 500) {
      synopsis = synopsis.substring(0, 500) + "...";
    }

    const embed = {
      color: 0x2e51a2,
      title: anime.title,
      url: `https://myanimelist.net/anime/${anime.id}`,
      description: synopsis,
      thumbnail: anime.main_picture ? { url: anime.main_picture.medium } : null,
      fields: [
        {
          name: "📊 Thống kê",
          value: `⭐ Điểm: ${anime.mean || "N/A"}/10\n🏆 Xếp hạng: #${
            anime.rank || "N/A"
          }\n❤️ Độ phổ biến: #${anime.popularity || "N/A"}\n👥 Người dùng: ${
            anime.num_list_users?.toLocaleString() || "N/A"
          }`,
          inline: true,
        },
        {
          name: "📝 Thông tin",
          value: `📺 Loại: ${
            anime.media_type?.toUpperCase() || "N/A"
          }\n🎬 Số tập: ${
            anime.num_episodes || "N/A"
          }\n📅 Trạng thái: ${status}\n⌛ Thời lượng: ${
            anime.average_episode_duration
              ? Math.floor(anime.average_episode_duration / 60) + " phút"
              : "N/A"
          }`,
          inline: true,
        },
      ],
      footer: {
        text: "Powered by MyAnimeList API",
      },
      timestamp: new Date(),
    };

    if (anime.start_season) {
      let season = "";
      switch (anime.start_season.season) {
        case "winter":
          season = "Đông";
          break;
        case "spring":
          season = "Xuân";
          break;
        case "summer":
          season = "Hạ";
          break;
        case "fall":
          season = "Thu";
          break;
      }
      embed.fields.push({
        name: "🗓️ Mùa",
        value: `${season} ${anime.start_season.year}`,
        inline: true,
      });
    }

    if (anime.studios && anime.studios.length > 0) {
      const studioNames = anime.studios.map((s) => s.name).join(", ");
      embed.fields.push({
        name: "🏢 Studio",
        value: studioNames,
        inline: true,
      });
    }

    if (anime.genres && anime.genres.length > 0) {
      const genreList = anime.genres.map((g) => g.name).join(", ");
      embed.fields.push({
        name: "🏷️ Thể loại",
        value: genreList,
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
      footer: {
        text: "Powered by MyAnimeList API",
      },
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

    // Log dữ liệu để debug
    logger.info(
      "MAL API",
      `Tạo embed cho ${topResults.length} kết quả ranking`
    );

    // Thêm các kết quả vào embed
    topResults.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        logger.warn(
          "MAL API",
          `Phần tử không hợp lệ ở vị trí ${index}: ${JSON.stringify(item)}`
        );
        return;
      }

      // Kiểm tra và truy cập an toàn
      const anime = item.node || {};
      const ranking = item.ranking || index + 1;

      // Đảm bảo title luôn có giá trị
      const title = anime.title || "Không có tiêu đề";

      let info = "";
      if (anime.mean) info += `⭐ Điểm: ${anime.mean}/10\n`;
      if (anime.num_episodes) info += `🎬 Tập: ${anime.num_episodes}\n`;
      if (anime.media_type)
        info += `📺 Loại: ${anime.media_type.toUpperCase()}\n`;

      // Thêm ID nếu có
      if (anime.id) {
        info += `🔗 https://myanimelist.net/anime/${anime.id}`;
      }

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
      footer: {
        text: "Powered by MyAnimeList API",
      },
      timestamp: new Date(),
      fields: [],
    };

    if (mangaList.length === 0) {
      embed.description = "Không tìm thấy kết quả nào.";
      return embed;
    }

    // Lấy tối đa 5 kết quả để hiển thị
    const topResults = mangaList.slice(0, 5);

    // Thêm thumbnail cho embed là ảnh của manga đầu tiên
    if (topResults[0].node.main_picture) {
      embed.thumbnail = { url: topResults[0].node.main_picture.medium };
    }

    // Thêm các kết quả vào embed
    topResults.forEach((item, index) => {
      const manga = item.node;
      let status = "N/A";
      switch (manga.status) {
        case "finished":
          status = "Đã hoàn thành";
          break;
        case "currently_publishing":
          status = "Đang xuất bản";
          break;
        case "not_yet_published":
          status = "Chưa xuất bản";
          break;
      }

      let info = "";
      if (manga.mean) info += `⭐ Điểm: ${manga.mean}/10\n`;
      if (manga.num_volumes) info += `📚 Tập: ${manga.num_volumes}\n`;
      if (manga.num_chapters) info += `📑 Chương: ${manga.num_chapters}\n`;
      info += `📅 Trạng thái: ${status}\n`;

      if (manga.genres && manga.genres.length > 0) {
        const genreList = manga.genres
          .map((g) => g.name)
          .slice(0, 3)
          .join(", ");
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
    if (!manga)
      return {
        color: 0xff0000,
        title: "Lỗi",
        description: "Không thể tìm thấy thông tin manga.",
        footer: { text: "Powered by MyAnimeList API" },
        timestamp: new Date(),
      };

    let status = "N/A";
    switch (manga.status) {
      case "finished":
        status = "Đã hoàn thành";
        break;
      case "currently_publishing":
        status = "Đang xuất bản";
        break;
      case "not_yet_published":
        status = "Chưa xuất bản";
        break;
    }

    // Rút gọn synopsis nếu quá dài
    let synopsis = manga.synopsis || "Không có mô tả.";
    if (synopsis.length > 500) {
      synopsis = synopsis.substring(0, 500) + "...";
    }

    const embed = {
      color: 0x2e51a2,
      title: manga.title,
      url: `https://myanimelist.net/manga/${manga.id}`,
      description: synopsis,
      thumbnail: manga.main_picture ? { url: manga.main_picture.medium } : null,
      fields: [
        {
          name: "📊 Thống kê",
          value: `⭐ Điểm: ${manga.mean || "N/A"}/10\n🏆 Xếp hạng: #${
            manga.rank || "N/A"
          }\n❤️ Độ phổ biến: #${manga.popularity || "N/A"}\n👥 Người dùng: ${
            manga.num_list_users?.toLocaleString() || "N/A"
          }`,
          inline: true,
        },
        {
          name: "📝 Thông tin",
          value: `📚 Tập: ${manga.num_volumes || "N/A"}\n📑 Chương: ${
            manga.num_chapters || "N/A"
          }\n📅 Trạng thái: ${status}`,
          inline: true,
        },
      ],
      footer: {
        text: "Powered by MyAnimeList API",
      },
      timestamp: new Date(),
    };

    // Thêm thông tin tác giả
    if (manga.authors && manga.authors.length > 0) {
      const authorNames = manga.authors
        .map((a) => `${a.node.first_name} ${a.node.last_name}`)
        .join(", ");
      embed.fields.push({
        name: "✍️ Tác giả",
        value: authorNames,
        inline: true,
      });
    }

    // Thêm thông tin thể loại
    if (manga.genres && manga.genres.length > 0) {
      const genreList = manga.genres.map((g) => g.name).join(", ");
      embed.fields.push({
        name: "🏷️ Thể loại",
        value: genreList,
        inline: false,
      });
    }

    return embed;
  }
}

module.exports = new MyAnimeListAPI();
