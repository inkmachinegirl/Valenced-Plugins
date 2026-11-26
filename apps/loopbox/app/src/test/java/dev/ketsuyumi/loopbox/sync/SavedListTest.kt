package dev.ketsuyumi.loopbox.sync

import dev.ketsuyumi.loopbox.data.Source
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Which requests count as your saved lists. */
class SavedListTest {
    // The For You request from a real sync log: its query has data_collection_enabled=true.
    private val forYou = "https://www.tiktok.com/api/recommend/item_list/?WebIdLastTime=1795713908&aid=1988&count=6" +
        "&data_collection_enabled=true&device_platform=web_pc"
    private val savedSounds = "https://www.tiktok.com/api/user/collect/music_list/?aid=1988&count=30&cursor=0&secUid=x"
    private val savedVideos = "https://www.tiktok.com/api/user/collect/item_list/?aid=1988&count=30&cursor=0&secUid=x"

    @Test fun forYouIsNotSaved() {
        assertFalse(isSavedList(Source.TIKTOK, "https://www.tiktok.com/foryou", forYou))
        assertFalse(isSavedVideos(Source.TIKTOK, "https://www.tiktok.com/foryou", forYou))
    }

    @Test fun favoritesAreSaved() {
        assertTrue(isSavedList(Source.TIKTOK, "https://www.tiktok.com/@me", savedSounds))
        assertTrue(isSavedVideos(Source.TIKTOK, "https://www.tiktok.com/@me", savedVideos))
    }

    @Test fun profilePages() {
        assertTrue(isProfilePage(Source.TIKTOK, "https://www.tiktok.com/@hood_evernight"))
        assertFalse(isProfilePage(Source.TIKTOK, "https://www.tiktok.com/foryou"))
        assertFalse(isProfilePage(Source.TIKTOK, "https://www.tiktok.com/@a/video/1"))
    }
}
