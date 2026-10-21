/// A remote release is an update only when its semver is greater than the
/// running app. Date versions such as 26.10.26 compare numerically, so
/// 26.10.26 is newer than 26.10.9.
pub fn release_is_newer(current: &semver::Version, latest: &semver::Version) -> bool {
    latest > current
}

#[cfg(test)]
mod tests {
    use super::release_is_newer;
    use semver::Version;

    fn version(value: &str) -> Version {
        Version::parse(value).expect(value)
    }

    #[test]
    fn date_versions_compare_as_semver() {
        let october = version("26.10.26");
        assert!(release_is_newer(&version("26.10.9"), &october));
        assert!(release_is_newer(&version("26.10.25"), &october));
        assert!(!release_is_newer(&october, &october));
        assert!(release_is_newer(&october, &version("26.11.1")));
        assert!(release_is_newer(&version("26.9.30"), &version("26.10.1")));
        assert!(!release_is_newer(&october, &version("26.10.9")));
        // String order treats 26.10.9 as newer than 26.10.26. Semver must not.
        assert!("26.10.9" > "26.10.26");
        assert!(version("26.10.26") > version("26.10.9"));
    }
}
