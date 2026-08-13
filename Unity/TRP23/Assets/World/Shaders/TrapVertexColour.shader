// Lit, and tinted by the mesh's own vertex colours.
//
// The tiler gives every building a colour derived from its OSM tags -- brick
// downhill, limestone above the 45m contour, render, modern glass -- and the
// mesh builders already write it into the colour stream. URP/Lit does not read
// vertex colours at all, so until now the whole city rendered in one flat
// material colour and all that classification was thrown away on the GPU.
//
// This is a normal shader ASSET, referenced from the material. It is
// deliberately not looked up with Shader.Find: that returns null at runtime for
// URP shaders in a player build unless the shader is in Always Included, which
// cost four rounds of magenta to work out once already.
Shader "TRAP/Vertex Colour"
{
    Properties
    {
        _BaseMap("Base Map", 2D) = "white" {}
        // Generated at runtime by CityTextures.NormalFor, written as a plain
        // rgb vector in a LINEAR texture -- not Unity's DXT5nm packing, which
        // exists for a compression we are not using.
        _BumpMap("Normal Map", 2D) = "bump" {}
        _BumpScale("Normal Scale", Range(0,2)) = 1.0
        _BaseColor("Base Colour", Color) = (1,1,1,1)
        _Smoothness("Smoothness", Range(0,1)) = 0.05
        _Metallic("Metallic", Range(0,1)) = 0.0

        // 2 = Back (normal), 0 = Off (double-sided). Buildings are hollow
        // shells, so from inside one -- which fly mode puts you in constantly --
        // single-sided walls mean you look straight out through the city.
        // Double-siding costs overdraw, so it is a per-material choice rather
        // than something baked in for the ground and the roads too.
        [Enum(UnityEngine.Rendering.CullMode)] _Cull("Cull", Float) = 2
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fog

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                float2 uv         : TEXCOORD0;
                float4 colour     : COLOR;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS   : TEXCOORD1;
                float2 uv         : TEXCOORD2;
                float4 colour     : COLOR;
                float  fogCoord   : TEXCOORD3;
            };

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);
            TEXTURE2D(_BumpMap);
            SAMPLER(sampler_BumpMap);

            // Tangent frame from screen-space derivatives.
            //
            // The mesh builders write position, normal, uv and colour -- no
            // tangents. Adding a tangent stream would mean touching every
            // builder and paying four more floats per vertex across 6,947
            // buildings, to describe a frame that is already implied by the UVs
            // we have. This derives it per pixel instead, which is the standard
            // trick for exactly this case and costs no memory at all.
            float3x3 CotangentFrame(float3 N, float3 p, float2 uv)
            {
                float3 dp1 = ddx(p);
                float3 dp2 = ddy(p);
                float2 duv1 = ddx(uv);
                float2 duv2 = ddy(uv);

                float3 dp2perp = cross(dp2, N);
                float3 dp1perp = cross(N, dp1);
                float3 T = dp2perp * duv1.x + dp1perp * duv2.x;
                float3 B = dp2perp * duv1.y + dp1perp * duv2.y;

                // rsqrt of the larger, so a degenerate UV on one axis cannot
                // blow the frame up.
                float invmax = rsqrt(max(dot(T, T), dot(B, B)) + 1e-8);
                return float3x3(T * invmax, B * invmax, N);
            }

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                float _BumpScale;
                half4  _BaseColor;
                half   _Smoothness;
                half   _Metallic;
                float  _Cull;
            CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs p = GetVertexPositionInputs(IN.positionOS.xyz);
                VertexNormalInputs n = GetVertexNormalInputs(IN.normalOS);

                OUT.positionCS = p.positionCS;
                OUT.positionWS = p.positionWS;
                OUT.normalWS = n.normalWS;
                OUT.uv = TRANSFORM_TEX(IN.uv, _BaseMap);
                OUT.colour = IN.colour;
                OUT.fogCoord = ComputeFogFactor(p.positionCS.z);
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                half4 albedo = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, IN.uv)
                             * _BaseColor * IN.colour;

                SurfaceData surface = (SurfaceData)0;
                surface.albedo = albedo.rgb;
                surface.alpha = 1.0h;
                surface.metallic = _Metallic;
                surface.smoothness = _Smoothness;
                surface.occlusion = 1.0h;
                // Masonry relief. Without this, brick and stone are flat
                // coloured photographs at every distance -- the courses are
                // drawn, they just never catch the light.
                half3 packed = SAMPLE_TEXTURE2D(_BumpMap, sampler_BumpMap, IN.uv).rgb;
                half3 nTS = half3(packed * 2.0h - 1.0h);
                nTS.xy *= _BumpScale;
                surface.normalTS = normalize(nTS);

                InputData input = (InputData)0;
                input.positionWS = IN.positionWS;
                float3 geoN = normalize(IN.normalWS);
                float3x3 tbn = CotangentFrame(geoN, IN.positionWS, IN.uv);
                input.normalWS = normalize(mul(surface.normalTS, tbn));
                input.viewDirectionWS = GetWorldSpaceNormalizeViewDir(IN.positionWS);
                input.shadowCoord = TransformWorldToShadowCoord(IN.positionWS);
                input.fogCoord = IN.fogCoord;
                input.bakedGI = SampleSH(input.normalWS);

                half4 lit = UniversalFragmentPBR(input, surface);
                lit.rgb = MixFog(lit.rgb, IN.fogCoord);
                return lit;
            }
            ENDHLSL
        }

        // Without these the city casts no shadows and is invisible to any
        // depth-based effect, which on URP includes SSAO and the depth prepass.
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On
            ZTest LEqual
            ColorMask 0
            // Must match the forward pass. If the depth prepass culls faces the
            // forward pass keeps, URP writes depth for one set of surfaces and
            // colour for another, and the difference shows up as exactly the
            // kind of see-through you cannot explain by looking at the mesh.
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex ShadowVert
            #pragma fragment ShadowFrag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4  _BaseColor;
                half   _Smoothness;
                half   _Metallic;
                float  _Cull;
            CBUFFER_END

            float3 _LightDirection;

            struct ShadowAttributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
            };

            float4 ShadowVert(ShadowAttributes IN) : SV_POSITION
            {
                float3 posWS = TransformObjectToWorld(IN.positionOS.xyz);
                float3 nrmWS = TransformObjectToWorldNormal(IN.normalOS);
                float4 positionCS = TransformWorldToHClip(
                    ApplyShadowBias(posWS, nrmWS, _LightDirection));
            #if UNITY_REVERSED_Z
                positionCS.z = min(positionCS.z, UNITY_NEAR_CLIP_VALUE);
            #else
                positionCS.z = max(positionCS.z, UNITY_NEAR_CLIP_VALUE);
            #endif
                return positionCS;
            }

            half4 ShadowFrag() : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On
            ColorMask 0
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex DepthVert
            #pragma fragment DepthFrag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4  _BaseColor;
                half   _Smoothness;
                half   _Metallic;
                float  _Cull;
            CBUFFER_END

            float4 DepthVert(float4 positionOS : POSITION) : SV_POSITION
            {
                return TransformObjectToHClip(positionOS.xyz);
            }

            half4 DepthFrag() : SV_Target { return 0; }
            ENDHLSL
        }
    }

    // If URP is ever swapped out, this at least renders rather than going
    // magenta -- the single most expensive failure mode in this project so far.
    FallBack "Universal Render Pipeline/Lit"
}
