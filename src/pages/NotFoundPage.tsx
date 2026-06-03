import { Link } from "react-router-dom";
import { siteCopy } from "../config/siteCopy";

export function NotFoundPage() {
  return (
    <div className="content-page not-found">
      <div className="section-label">{siteCopy.notFound.label}</div>
      <h1>{siteCopy.notFound.title}</h1>
      <p>{siteCopy.notFound.body}</p>
      <Link to="/" className="accent-button">
        {siteCopy.notFound.cta}
      </Link>
    </div>
  );
}
