import styles from "./MainButton.module.scss";
import cx from "classnames";

interface MainButtonProps {
  label: string;
  className?: string;
  btnClassName?: string;
  disabled?: boolean;
  onClick: () => void;
}

export const MainButton = ({ label, className, btnClassName, disabled, onClick }: MainButtonProps) => {
  return (
    <div className={cx(className, styles.MainButton)}>
      <button disabled={disabled} onClick={onClick}>
        <div className={btnClassName}>{label}</div>
      </button>
    </div>
  );
};
