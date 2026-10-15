package util

import (
	"encoding/json"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestBuildMihomoConfig_VLESSRealityJSONAndYAMLRoundTrip(t *testing.T) {
	const publicKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

	proxies := []map[string]interface{}{{
		"name":               "reality",
		"type":               "vless",
		"server":             "example.com",
		"port":               443,
		"uuid":               "ffffffff-ffff-ffff-ffff-ffffffffffff",
		"network":            "tcp",
		"tls":                true,
		"flow":               "xtls-rprx-vision",
		"encryption":         "none",
		"servername":         "sni.example.com",
		"client-fingerprint": "chrome",
		"reality-opts": map[string]interface{}{
			"public-key": publicKey,
			"short-id":   "",
		},
	}}

	// CustomConfig.Proxies is persisted as JSON. Marshal/unmarshal here so the
	// assertion exercises the same type boundary as the API/database path.
	stored, err := json.Marshal(proxies)
	if err != nil {
		t.Fatal(err)
	}
	var loaded []map[string]interface{}
	if err := json.Unmarshal(stored, &loaded); err != nil {
		t.Fatal(err)
	}

	out, err := BuildMihomoConfig("", nil, loaded, nil, nil, "replace", nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	var generated struct {
		Proxies []map[string]interface{} `yaml:"proxies"`
	}
	if err := yaml.Unmarshal(out, &generated); err != nil {
		t.Fatal(err)
	}
	if len(generated.Proxies) != 1 {
		t.Fatalf("expected one generated proxy, got %d\n%s", len(generated.Proxies), out)
	}
	proxy := generated.Proxies[0]
	if proxy["type"] != "vless" || proxy["network"] != "tcp" || proxy["encryption"] != "none" {
		t.Fatalf("generated VLESS identity fields changed: %#v", proxy)
	}
	if tls, ok := proxy["tls"].(bool); !ok || !tls {
		t.Fatalf("expected tls: true, got %#v", proxy["tls"])
	}
	if proxy["client-fingerprint"] != "chrome" || proxy["servername"] != "sni.example.com" {
		t.Fatalf("generated TLS fields changed: %#v", proxy)
	}
	reality, ok := proxy["reality-opts"].(map[string]interface{})
	if !ok {
		t.Fatalf("reality-opts was not an object: %#v", proxy["reality-opts"])
	}
	if reality["public-key"] != publicKey {
		t.Fatalf("public key changed: %#v", reality["public-key"])
	}
	shortID, ok := reality["short-id"].(string)
	if !ok || shortID != "" {
		t.Fatalf("short-id must remain an empty string, got %#v", reality["short-id"])
	}
}

func TestExpandCustomProxies_VLESSNestedRawYAML(t *testing.T) {
	const publicKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	proxies := ExpandCustomProxies([]map[string]interface{}{{
		"type":    "custom",
		"__raw__": "type: vless\nname: raw-reality\nserver: example.com\nport: 443\nnetwork: tcp\ntls: true\nreality-opts:\n  public-key: " + publicKey + "\n  short-id: '0123'\n",
	}})
	if len(proxies) != 1 {
		t.Fatalf("expected one expanded proxy, got %d", len(proxies))
	}
	proxy, ok := proxies[0].(map[string]interface{})
	if !ok {
		t.Fatalf("expanded proxy is not an object: %#v", proxies[0])
	}
	reality, ok := proxy["reality-opts"].(map[string]interface{})
	if !ok {
		t.Fatalf("expanded reality opts are not an object: %#v", proxy["reality-opts"])
	}
	if reality["short-id"] != "0123" {
		t.Fatalf("raw YAML short-id changed type/value: %#v", reality["short-id"])
	}
}
