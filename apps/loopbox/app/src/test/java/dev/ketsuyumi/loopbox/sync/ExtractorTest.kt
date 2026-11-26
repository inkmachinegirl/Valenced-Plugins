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

    @Test fun ignoresNonJson() {
        assertEquals(0, Extractor.extract(Source.TIKTOK, "<html>playUrl</html>", null).size)
    }
}
