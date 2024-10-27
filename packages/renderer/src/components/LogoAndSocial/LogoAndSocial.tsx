import type React from "react";
import { ipcSend } from "@arenareturnslauncher/preload";
import styles from "./LogoAndSocial.module.scss";
import twitterIcon from "../../../assets/img/twitter.png";
import discordIcon from "../../../assets/img/discord.png";
import twitchIcon from "../../../assets/img/twitch.png";
import youtubeIcon from "../../../assets/img/youtube.png";

const openUrl = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  ipcSend("openUrl", e.currentTarget.href);
};

export const LogoAndSocial = () => {
  return (
    <div className={styles.LogoAndSocial}>
      <div className={styles.logo} />
      <div className={styles.social}>
        <span className={styles.label}>Rejoignez-nous sur nos réseaux !</span>
        <div className={styles.socialIcons}>
          <a className={styles.twitter} href="https://twitter.com/ArenaReturns" onClick={openUrl}>
            <img src={twitterIcon} alt="Twitter" />
          </a>
          <a className={styles.discord} href="https://discord.gg/arena-returns-934862812075917353" onClick={openUrl}>
            <img src={discordIcon} alt="Discord" />
          </a>
          <a className={styles.twitch} href="https://twitch.tv/ArenaReturns" onClick={openUrl}>
            <img src={twitchIcon} alt="Twitch" />
          </a>
          <a className={styles.youtube} href="https://www.youtube.com/channel/UCgJ8CHqNHXItrWzAF6mOFnQ" onClick={openUrl}>
            <img src={youtubeIcon} alt="Youtube" />
          </a>
        </div>
      </div>
    </div>
  );
};
