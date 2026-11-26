package dev.ketsuyumi.loopbox.sync

import dev.ketsuyumi.loopbox.data.Source
import org.junit.Assert.assertEquals
import org.junit.Test

class ExtractorTest {
    @Test fun tiktokMusicList() {
        val json = """{"statusCode":0,"musicList":[
          {"id":"7012345678901234567","title":"original sound - kiyo","authorName":"kiyo","playUrl":"https://sf16-ies-music.tiktokcdn.com/obj/a.mp3","coverLarge":"https://p16.tiktokcdn.com/c.jpeg"},
          {"id":"7099999999999999999","title":"Teto Territory","authorName":"Kasane Teto","playUrl":{"UrlList":["https://sf16.tiktokcdn.com/b.mp3"]},"coverMedium":"https://p16/m.jpeg"}
        ],"hasMore":true}"""
        val s = Extractor.extract(Source.TIKTOK, json, "https://www.tiktok.com/@me")
        assertEquals(2, s.size)
        assertEquals("tt:7012345678901234567", s[0].key)
        assertEquals("https://sf16.tiktokcdn.com/b.mp3", s[1].remoteUrl)
        assertEquals("Kasane Teto", s[1].artist)
    }

    @Test fun tiktokSnakeCaseAndVideoMusic() {
        val json = """{"itemList":[{"id":"1","desc":"video","music":{"id_str":"55","title":"song","author":"band","play_url":{"url_list":["https://x/p.mp3"]},"cover_large":{"url_list":["https://x/c.jpg"]}}}]}"""
        val s = Extractor.extract(Source.TIKTOK, json, null)
        assertEquals(1, s.size); assertEquals("tt:55", s[0].key); assertEquals("https://x/c.jpg", s[0].cover)
    }

    @Test fun instagramMusicAndOriginal() {
        val json = """{"items":[
          {"music_asset_info":{"audio_cluster_id":"111","title":"Butterfly","display_artist":"Smile.dk","progressive_download_url":"https://ig/a.m4a","cover_artwork_uri":"https://ig/c.jpg"}},
          {"original_sound_info":{"audio_asset_id":"222","original_audio_title":"Original audio","ig_artist":{"username":"satou"},"progressive_download_url":"https://ig/b.m4a"}},
          {"not_audio":{"title":"x"}}
        ]}"""
        val s = Extractor.extract(Source.INSTAGRAM, json, null)
        assertEquals(2, s.size)
        assertEquals("ig:111", s[0].key); assertEquals("Smile.dk", s[0].artist)
        assertEquals("ig:222", s[1].key); assertEquals("satou", s[1].artist)
    }

    @Test fun tiktokSavedVideosSkipTheirMusic() {
        val json = """{"itemList":[{"id":"7300000000000000001","desc":"teto dance","author":{"uniqueId":"kiyo","nickname":"Kiyo"},
          "video":{"playAddr":"https://v16-webapp.tiktok.com/v.mp4?expire=1","cover":"https://p16/cover.jpg"},
          "music":{"id":"55","title":"song","authorName":"band","playUrl":"https://x/p.mp3"}}],"hasMore":true,"cursor":"30"}"""
        val (sounds, videos) = Extractor.extractAll(Source.TIKTOK, json, null)
        assertEquals(0, sounds.size)
        assertEquals(1, videos.size)
        val v = videos[0]
        assertEquals("ttv:7300000000000000001", v.key); assertEquals(true, v.video)
        assertEquals("https://x/p.mp3", v.remoteUrl); assertEquals("https://v16-webapp.tiktok.com/v.mp4?expire=1", v.videoUrl)
        assertEquals("https://www.tiktok.com/@kiyo/video/7300000000000000001", v.pageUrl); assertEquals("Kiyo", v.artist)
    }

    @Test fun instagramSavedReel() {
        val json = """{"items":[{"media":{"code":"ABC","user":{"username":"satou"},"caption":{"text":"hi"},
          "video_versions":[{"url":"https://ig/v.mp4"}],"image_versions2":{"candidates":[{"url":"https://ig/c.jpg"}]},
          "clips_metadata":{"original_sound_info":{"audio_asset_id":"9","progressive_download_url":"https://ig/a.m4a"}}}}]}"""
        val (sounds, videos) = Extractor.extractAll(Source.INSTAGRAM, json, null)
        assertEquals(0, sounds.size); assertEquals(1, videos.size)
        assertEquals("igv:ABC", videos[0].key); assertEquals("https://ig/a.m4a", videos[0].remoteUrl)
    }

    @Test fun ignoresNonJson() {
        assertEquals(0, Extractor.extract(Source.TIKTOK, "<html>playUrl</html>", null).size)
    }
}
