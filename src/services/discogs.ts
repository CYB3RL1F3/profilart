import config from "config";
import Service from "service";
import DiscogsAdapter from "adapters/discogs";
import err from "err";
import * as Sentry from "@sentry/node";
import Database from "lib/database";
import { ProfileModel } from "model/profile";
import { Models } from "model/models";
import {
  ReleasesByNameArgs,
  ReleasesByIdArgs,
  Release,
  RawReleases,
  ReleaseInfo
} from "model/releases";

export class Discogs extends Service {
  adapter: DiscogsAdapter;
  constructor(database: Database) {
    super(database);
    this.adapter = new DiscogsAdapter();
  }

  getReleaseByName = async (
    profile: ProfileModel,
    args: ReleasesByNameArgs
  ) => {
    if (!(args && args.name)) throw err(400, "a name arg must be provided");

    const releases = await this.getReleases(profile);
    const release = releases.find(
      (release) => release.title.toLowerCase() === args.name.toLowerCase()
    );
    if (!release) throw err(404, "release not found");
    return release;
  };

  getReleaseById = async (
    profile: ProfileModel,
    args: ReleasesByIdArgs
  ): Promise<Release> => {
    if (!(args && args.id)) {
      if (args && args.name) return this.getReleaseByName(profile, args);
      throw err(400, "a name arg must be provided");
    }
    const releases = await this.getReleases(profile);
    const release = releases.find(
      (release) => parseInt(release.id, 10) === parseInt(args.id, 10)
    );
    if (!release) throw err(404, "release not found");
    return release;
  };

  getReleases = async (profile: ProfileModel): Promise<Release[]> => {
    try {
      const fromCache = this.cache.get<Release[]>(
        profile,
        "discogs",
        "releases"
      );
      if (fromCache) return fromCache;
      const id = profile && profile.discogs && profile.discogs.artistId;
      const endpoint = `${config.api.discogs.api_url}/artists/${id}/releases`;
      const { releases } = await this.query<RawReleases>(endpoint);

      let results: Release[] = [];
      if (releases) {
        const partialResults = await Promise.all(
          releases.map(async (release) => {
            let infos = await this.query<ReleaseInfo>(release.resource_url);
            if (infos.main_release_url) {
              infos = await this.query<ReleaseInfo>(infos.main_release_url);
            }
            const adaptedRelease = await this.adapter.adaptRelease(
              release,
              infos
            );
            return adaptedRelease;
          })
        );
        partialResults.forEach((release) => {
          if (
            !results.find((result) => result.cat === release.cat) &&
            !results.find((result) => result.title === release.title)
          ) {
            results.push(release);
          }
        });
      }
      await this.persist<Release[]>(profile, Models.releases, results);
      this.cache.set<Release[]>(profile, "discogs", Models.releases, results);
      return results;
    } catch (e) {
      Sentry.withScope((scope) => {
        scope.setExtra("getReleases", e);
        Sentry.captureException(e);
      });
      try {
        const { content } = await this.fromDb<Release[]>(
          profile,
          Models.releases
        );
        return content;
      } catch (err) {
        Sentry.withScope((scope) => {
          scope.setExtra("getRelease", err);
          Sentry.captureException(err);
        });
        throw e;
      }
    }
  };

  query = <T>(url: string) =>
    this.api.requestAndParseJSON<T>({
      url: `${url}?key=${config.api.discogs.key}&secret=${config.api.discogs.secret}`,
      method: "GET",
      headers: {
        "User-Agent": config.userAgent,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
}

export default Discogs;
