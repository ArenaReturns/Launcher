import { ipcInvoke } from "@arenareturnslauncher/preload";
import { useEffect, useState } from "react";
import type { CarouselItem } from "../../types";

import "react-responsive-carousel/lib/styles/carousel.min.css";
import { Carousel } from "react-responsive-carousel";
import styles from "./NewsCarousel.module.scss";

export const NewsCarousel = () => {
  const [slideData, setSlideData] = useState<CarouselItem[]>();

  useEffect(() => {
    ipcInvoke("getCarouselData").then((carouselData: Array<CarouselItem>) => {
      setSlideData(carouselData);
    });
  }, []);

  return (
    <div className={styles.NewsCarousel}>
      {slideData && (
        <Carousel showStatus={false} showThumbs={false} autoPlay={true} infiniteLoop={true}>
          {slideData.map(slide => (
            <div key={slide.id}>
              <img src={slide.image} />
            </div>
          ))}
        </Carousel>
      )}
    </div>
  );
};
