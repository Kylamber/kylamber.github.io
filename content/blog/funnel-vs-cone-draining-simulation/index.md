---
date: '2025-11-17T20:56:05+07:00'
draft: false
title: 'Funnel vs Cone Draining Simulation'
tags:
    - 'C'
    - 'Physics'
    - 'Programming'
---

I got asked this question some days ago.

![Which would empty first](/blog/funnel-vs-cone-draining-simulation/question.jpg)

Image source: https://www.reddit.com/r/whatsyourchoice/comments/1op56hi/x_or_y_and_why/

This piqued my interest in simulating it, but I don't have any fluid simulation knowhow. However, I know Bernoulli's equation and Torricelli's law, so I say let's dissect this problem.

Let's start with the faucet, assume that at a short time \( dt \) the volume coming out of it is a cylinder with volume \( dV \). We can compute \( dV \) through

\[ dV = \pi r_f^2 dh_f \]

where \( r_f \) is the faucet's radius. \( dh_f \) which is the height coming out of the faucet can be computed from

\[ dh_f = v_f dt \]

where \( v_f \) is the velocity of the water coming out of the faucet that can be found through [Bernoulli's equation](http://hyperphysics.phy-astr.gsu.edu/hbase/pber.html). Here we have the same atmospheric pressure \( (P) \), no hydrostatic pressure for the water at the top of the tank, and same density \( (\rho) \).

\[
\begin{align*}
P + \frac{1}{2}\rho v^2 + \rho g h & = \text{constant} \\
P_f + \frac{1}{2}\rho_f v_f^2 + \rho_f g h_f & = P_t + \frac{1}{2}\rho_t v_t^2 + \rho_t g h_t \\
\frac{1}{2}v_f^2 + g h_f & = \frac{1}{2}v_t^2 \\
v_f & = \sqrt{v_t^2 - 2gh_f}. \\
\end{align*}
\]

with subscript \( t \) denoting the top of the tank. Now the lost volume is the same as the one lost in the funnel/cone. To find how much height the tank lost, we can assume that the radius of the cone is the same for a small \( dh \) (I did try without multiplying by 3 by assuming that it's cylindrical but it's more accurate this way)

\[
\begin{align*}
\frac{1}{3} \pi r_t(h_t)^2 h_t - \frac{1}{3} \pi r_t(h_t-dh_t)^2 (h_t - dh_t) & = dV \\
\frac{1}{3} \pi r^2 h_t - \frac{1}{3} \pi r^2 (h_t - dh_t) & = dV \\
\frac{1}{3} \pi r^2 dh_t & = dV \\
dh_t & = \frac{3 dV}{\pi r_t(h_t)^2}
\end{align*}
\]

where \( r = r_t(h_t) \) is the radius of the tank given the current tank's height. For the radius of the tank, we can set it as a line with a slope \( (k) \)

\[ r_t(h_t) = k h_t. \]

We now have the complete recipe to iteratively answer this question.

I'll be using [raylib](https://www.raylib.com/) to illustrate the simulations. Since I want to be able to deploy multiple funnels/cones at once, I'll create a struct that contains its information.

```c
struct Funnel {
	float rTop;
	float rBot;
	float rFaucet;
	float h;
	float k;

	float vTop;
	float vBot;
};
```

Then I can fill in the struct like so

```c
unsigned int fps = 60;
unsigned int dtMult = 100;
unsigned int timeMult = 16;
float g = -9.81f;
float dt = 1.0f/fps/dtMult;

float initRTop = 150.0f/100.0f;
float initRBot = 40.0f/100.0f;
float initVTop = 0.0f;
float rFaucet = 3.0f/100.0f;
float initH = 120.0f/100.0f; 

float calcSlope(float rTop, float rBot, float h) {	
	return h / ( rTop - rBot );
}

// Init funnels
struct Funnel funnel1 = {
    initRTop,
    initRBot,
    rFaucet,
    initH,
    calcSlope(initRTop, initRBot, initH),

    0,
    sqrt( - (2*g*initH) ),
};
struct Funnel initFunnel1;
initFunnel1 = funnel1; // For resetting

struct Funnel funnel2 = {
    initRBot,
    initRTop,
    rFaucet,
    initH,
    calcSlope(initRBot, initRTop, initH),

    0,
    sqrt( - (2*g*initH) ),
};
struct Funnel initFunnel2;
initFunnel2 = funnel2;
```

Then update the funnels' parameters using in a loop until `h = 0`.

```c
void updateFunnel(struct Funnel *f, float dt) {
    float dhCylinder = f->vBot * dt;
    float dV = cylinderVolume(f->rFaucet, dhCylinder);

    float dhCone = 3 * dV / (f->rTop * f->rTop * M_PI);;

    f->h -= dhCone;
    f->h = max(0, f->h);
    f->rTop = f->rBot + (f->h/f->k);
    f->vTop = dhCone / dt;
    f->vBot = sqrt( pow(f->vTop, 2) - (2.0f * g * f->h) );
}
```

Here's the result

{{< video src="/blog/funnel-vs-cone-draining-simulation/funnel.mp4" >}}

The initial values I chose are based on [this](https://youtu.be/aQfrhdIH3Tk?si=KV9qoS5WU5IC0z0w) real experiment by Heterodox's measurements. In the comments section, Heterodox said that tank X drained for 177 seconds and tank Y for 277 seconds. From my simulation tank X drained roughly for 119 seconds and tank Y drained for 239 seconds. It seems close enough for me with the usual justification of friction not being accounted for in this simulation.
